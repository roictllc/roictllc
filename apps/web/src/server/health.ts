import 'server-only';
import { db } from './db';

/** Component health for /status and /api/health (spec §5.2, §19). */
export async function componentHealth() {
  const components: Array<{ name: string; status: 'operational' | 'degraded' | 'down' | 'not deployed'; detail: string }> = [];
  let dbOk = false;
  const t = Date.now();
  try {
    await db().$queryRaw`SELECT 1`;
    dbOk = true;
    components.push({ name: 'Database', status: 'operational', detail: `SELECT 1 in ${Date.now() - t} ms` });
  } catch {
    components.push({ name: 'Database', status: 'down', detail: 'Unreachable' });
  }
  components.push({ name: 'Website & API', status: 'operational', detail: 'Serving this page' });
  if (dbOk) {
    const [queue, oldest, failed, hb, integrations] = await Promise.all([
      db().automationJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      db().automationJob.findFirst({ where: { status: 'PENDING' }, orderBy: { runAt: 'asc' }, select: { runAt: true } }),
      db().automationJob.count({ where: { status: { in: ['FAILED', 'DEAD'] }, updatedAt: { gte: new Date(Date.now() - 86400_000) } } }),
      db().workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } }),
      db().integration.findMany({ select: { key: true, name: true, status: true } }),
    ]);
    const ageS = oldest ? Math.round((Date.now() - oldest.runAt.getTime()) / 1000) : 0;
    components.push({ name: 'Job queue', status: ageS > 900 ? 'degraded' : 'operational', detail: `${queue} queued · oldest ${ageS}s · ${failed} failed in 24h` });
    const workerFresh = hb && Date.now() - hb.lastBeatAt.getTime() < 120_000;
    components.push({ name: 'Media worker', status: hb ? (workerFresh ? 'operational' : 'down') : 'not deployed', detail: hb ? `Last heartbeat ${Math.round((Date.now() - hb.lastBeatAt.getTime()) / 1000)}s ago` : 'Waiting for the worker server (VPS)' });
    for (const k of ['stripe', 'resend', 'r2', 'cloudflare']) {
      const i = integrations.find((x) => x.key === k);
      if (i) components.push({ name: i.name, status: i.status === 'CONNECTED' ? 'operational' : i.status === 'ERROR' ? 'down' : 'not deployed', detail: i.status === 'CONNECTED' ? 'Connected' : 'Awaiting configuration' });
    }
  }
  const core = components.filter((c) => ['Database', 'Website & API'].includes(c.name));
  return { overall: core.every((c) => c.status === 'operational') ? 'operational' : 'down', checkedAt: new Date().toISOString(), components };
}
