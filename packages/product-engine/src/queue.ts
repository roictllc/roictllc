import type { PrismaClient } from '@roi/database';

/**
 * PostgreSQL job queue (spec §10): claim with FOR UPDATE SKIP LOCKED, leases + heartbeats, exponential backoff,
 * max attempts per job, dead-letter state, stuck-job sweeper, priority lanes (paid > preview > housekeeping),
 * per-type concurrency limits, step + cost recording.
 */
export const LANES = { paid: 10, preview: 50, housekeeping: 90 } as const;

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  workspaceId: string | null;
  orderItemId: string | null;
}

export async function enqueue(db: PrismaClient, job: { type: string; payload: object; idempotencyKey: string; lane?: keyof typeof LANES; workspaceId?: string | null; orderItemId?: string | null; runAt?: Date; maxAttempts?: number }) {
  const lane = job.lane ?? 'paid';
  return db.automationJob.upsert({
    where: { idempotencyKey: job.idempotencyKey },
    update: {},
    create: { type: job.type, payload: job.payload, idempotencyKey: job.idempotencyKey, lane, priority: LANES[lane], workspaceId: job.workspaceId ?? null, orderItemId: job.orderItemId ?? null, runAt: job.runAt ?? new Date(), maxAttempts: job.maxAttempts ?? 3 },
  });
}

export async function claim(db: PrismaClient, workerId: string, types: string[], leaseSeconds = 300, concurrency: Record<string, number> = {}): Promise<ClaimedJob | null> {
  // Respect per-type concurrency: exclude types already at their limit.
  const busy = await db.automationJob.groupBy({ by: ['type'], where: { status: 'PROCESSING', type: { in: types } }, _count: true });
  const allowed = types.filter((t) => (busy.find((b) => b.type === t)?._count ?? 0) < (concurrency[t] ?? 4));
  if (!allowed.length) return null;
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE automation_jobs SET status = 'PROCESSING', "lockedBy" = ${workerId}, "lockedAt" = now(), "heartbeatAt" = now(),
      "leaseUntil" = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM automation_jobs
      WHERE status = 'PENDING' AND "runAt" <= now() AND type = ANY(${allowed})
      ORDER BY priority ASC, "runAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, type, payload, attempts, "maxAttempts", "workspaceId", "orderItemId"`;
  return rows[0] ?? null;
}

export async function heartbeat(db: PrismaClient, jobId: string, workerId: string, leaseSeconds = 300) {
  await db.$executeRaw`UPDATE automation_jobs SET "heartbeatAt" = now(), "leaseUntil" = now() + make_interval(secs => ${leaseSeconds}) WHERE id = ${jobId} AND "lockedBy" = ${workerId}`;
}

export async function complete(db: PrismaClient, jobId: string, result: object, costMillicents = 0, status: 'COMPLETED' | 'WAITING_FOR_APPROVAL' = 'COMPLETED') {
  await db.automationJob.update({ where: { id: jobId }, data: { status, result, costMillicents: { increment: costMillicents }, completedAt: status === 'COMPLETED' ? new Date() : null, lockedBy: null, leaseUntil: null, lastError: null } });
}

export const backoffSeconds = (attempt: number) => Math.min(3600, 15 * 2 ** (attempt - 1));

export async function fail(db: PrismaClient, job: Pick<ClaimedJob, 'id' | 'attempts' | 'maxAttempts'>, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  await db.automationJob.update({
    where: { id: job.id },
    data: { status: dead ? 'DEAD' : 'PENDING', lastError: error.slice(0, 2000), runAt: dead ? undefined : new Date(Date.now() + backoffSeconds(job.attempts) * 1000), lockedBy: null, leaseUntil: null },
  });
  return dead;
}

/** Re-queues jobs whose lease expired (worker crashed); runs every minute. */
export async function sweepStuck(db: PrismaClient) {
  return db.$executeRaw`UPDATE automation_jobs SET status = CASE WHEN attempts >= "maxAttempts" THEN 'DEAD'::"JobStatus" ELSE 'PENDING'::"JobStatus" END,
    "lockedBy" = NULL, "leaseUntil" = NULL, "lastError" = COALESCE("lastError", 'lease expired'), "updatedAt" = now()
    WHERE status = 'PROCESSING' AND "leaseUntil" < now()`;
}

export async function step<T>(db: PrismaClient, jobId: string, name: string, input: object | null, fn: () => Promise<T>, costMillicents = 0): Promise<T> {
  const startedAt = new Date();
  const s = await db.automationStep.create({ data: { jobId, name, status: 'PROCESSING', input: input ?? undefined, startedAt } });
  try {
    const out = await fn();
    const finishedAt = new Date();
    await db.automationStep.update({ where: { id: s.id }, data: { status: 'COMPLETED', output: summarize(out), finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), costMillicents } });
    return out;
  } catch (e) {
    await db.automationStep.update({ where: { id: s.id }, data: { status: 'FAILED', output: { error: (e as Error).message.slice(0, 1000) }, finishedAt: new Date() } });
    throw e;
  }
}

function summarize(v: unknown): object {
  if (v === null || v === undefined) return {};
  if (Buffer.isBuffer(v)) return { bytes: v.length };
  if (typeof v !== 'object') return { value: v as string };
  return JSON.parse(JSON.stringify(v, (_, x) => (Buffer.isBuffer(x) || (x && x.type === 'Buffer') ? `<${x.length ?? x.data?.length} bytes>` : x)));
}

export async function log(db: PrismaClient, jobId: string, level: 'info' | 'warn' | 'error', message: string, data?: object) {
  await db.automationLog.create({ data: { jobId, level, message, data } });
}
