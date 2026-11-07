/**
 * ROI media worker (spec §2.2, §10). Runs on the always-on server (Docker image with FFmpeg, sharp, resvg,
 * @napi-rs/canvas, poppler, ClamAV). Claims jobs from PostgreSQL, runs product handlers, heartbeats every 20 s,
 * sweeps stuck jobs every minute, and shuts down gracefully on SIGTERM.
 */
import os from 'node:os';
import { createPrisma } from '@roi/database';
import { claim, complete, fail, heartbeat, JOB_CONCURRENCY, JOB_HANDLERS, log, notifyDelivered, notifyFailed, sweepStuck, storageFromEnv, sendEmailFromWorker } from '@roi/product-engine';

const VERSION = process.env.ROI_VERSION ?? '1.0.0';
const workerId = `${os.hostname()}-${process.pid}`;
const db = createPrisma(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
let stopping = false;

function jlog(level: string, msg: string, extra: object = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, workerId, ...extra }));
}

async function beat() {
  await db.workerHeartbeat.upsert({ where: { workerId }, update: { lastBeatAt: new Date(), version: VERSION, info: { load: os.loadavg(), mem: process.memoryUsage().rss } }, create: { workerId, version: VERSION, lastBeatAt: new Date() } });
}

export async function runOnce(types = Object.keys(JOB_HANDLERS)): Promise<boolean> {
  const storage = storageFromEnv();
  if (!storage) {
    jlog('warn', 'storage awaiting configuration (R2_* or LOCAL_STORAGE_DIR in dev)');
    return false;
  }
  const job = await claim(db, workerId, types, 600, JOB_CONCURRENCY);
  if (!job) return false;
  jlog('info', 'job.claimed', { jobId: job.id, type: job.type, attempt: job.attempts });
  const hb = setInterval(() => heartbeat(db, job.id, workerId, 600).catch(() => {}), 20_000);
  try {
    const handler = JOB_HANDLERS[job.type];
    if (!handler) throw new Error(`No handler for ${job.type}`);
    const model = job.orderItemId ? await db.orderItem.findUnique({ where: { id: job.orderItemId }, include: { product: { include: { costModel: true } } } }) : null;
    const r = await handler({ db, storage, jobId: job.id, workspaceId: job.workspaceId!, orderItemId: job.orderItemId, payload: job.payload, computeRateMillicentsPerS: model?.product.costModel?.computeRateMillicentsPerS ?? 1 });
    await complete(db, job.id, r, r.costMillicents, r.awaitingApproval ? 'WAITING_FOR_APPROVAL' : 'COMPLETED');
    jlog('info', 'job.completed', { jobId: job.id, deliverables: r.deliverables });
    if (job.orderItemId && job.type.startsWith('product.') && !r.awaitingApproval) await notifyDelivered(db, job.orderItemId).catch((e) => jlog('error', 'notify.failed', { error: e.message }));
  } catch (e) {
    const dead = await fail(db, job, (e as Error).message);
    await log(db, job.id, 'error', (e as Error).message);
    jlog('error', 'job.failed', { jobId: job.id, dead, error: (e as Error).message });
    if (dead) {
      await db.auditLog.create({ data: { action: 'job.dead_letter', targetType: 'AutomationJob', targetId: job.id, data: { type: job.type } } });
      if (job.orderItemId && job.type.startsWith('product.')) await notifyFailed(db, job.orderItemId, (e as Error).message).catch((x) => jlog('error', 'notify.failed', { error: x.message }));
      else if (job.type.startsWith('housekeeping.')) {
        const staff = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { email: true } });
        for (const s of staff) await sendEmailFromWorker(db, s.email, 'admin-alert', { title: `Job dead-lettered: ${job.type}`, message: (e as Error).message.slice(0, 400) }).catch(() => {});
      }
    }
  } finally {
    clearInterval(hb);
  }
  return true;
}

async function main() {
  jlog('info', 'worker.start', { version: VERSION });
  await beat();
  const hb = setInterval(() => beat().catch((e) => jlog('error', 'heartbeat.failed', { error: e.message })), 20_000);
  const sweeper = setInterval(() => sweepStuck(db).then((n) => n && jlog('warn', 'swept stuck jobs', { n })).catch(() => {}), 60_000);
  const stop = () => {
    stopping = true;
    jlog('info', 'worker.stopping');
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  while (!stopping) {
    const worked = await runOnce().catch((e) => (jlog('error', 'loop.error', { error: e.message }), false));
    if (!worked) await new Promise((r) => setTimeout(r, 2000));
  }
  clearInterval(hb);
  clearInterval(sweeper);
  await db.$disconnect();
  jlog('info', 'worker.stopped');
}

if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) main();
