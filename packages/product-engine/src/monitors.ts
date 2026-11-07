import tls from 'node:tls';
import type { PrismaClient } from '@roi/database';
import { safeFetch } from '../../seo-engine/src/safe-fetch';
import type { Handler } from './handlers';
import { log } from './queue';
import { sendEmailFromWorker } from './notify';

/**
 * Day-one monitoring and billing enforcement (spec §19, §14, Product 5 billing rules). The worker's scheduler enqueues
 * these as housekeeping jobs with time-bucketed idempotency keys, so several workers never double-run them.
 */
const minuteKey = (d = new Date()) => d.toISOString().slice(0, 16);
const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export const SCHEDULE: Array<{ type: string; key: () => string; everyMinutes: number }> = [
  { type: 'monitor.uptime', key: minuteKey, everyMinutes: 1 },
  { type: 'monitor.queue', key: () => `${hourKey()}:${String(Math.floor(new Date().getUTCMinutes() / 5) * 5).padStart(2, '0')}`, everyMinutes: 5 },
  { type: 'billing.enforce', key: hourKey, everyMinutes: 60 },
  { type: 'monitor.ssl-domains', key: dayKey, everyMinutes: 1440 },
  { type: 'ai-visibility.monthly-reports', key: () => new Date().toISOString().slice(0, 7), everyMinutes: 43_200 }, // first run each month
];

/** Called by the worker every minute. */
export async function scheduleHousekeeping(db: PrismaClient) {
  let created = 0;
  for (const s of SCHEDULE) {
    const idempotencyKey = `${s.type}:${s.key()}`;
    const r = await db.automationJob.createMany({ data: [{ type: s.type, lane: 'housekeeping', priority: 90, payload: {}, idempotencyKey, maxAttempts: 1 }], skipDuplicates: true });
    created += r.count;
  }
  return created;
}

async function staffEmails(db: PrismaClient) {
  return (await db.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' }, select: { email: true } })).map((u) => u.email);
}

/** Alerts only on state changes (up→down, down→up), never on every failed check. */
async function alertOnce(db: PrismaClient, key: string, down: boolean, notify: () => Promise<void>) {
  const flag = await db.setting.findUnique({ where: { key: `alert-state:${key}` } });
  const wasDown = (flag?.value as { down?: boolean } | undefined)?.down === true;
  if (down === wasDown) return false;
  await db.setting.upsert({ where: { key: `alert-state:${key}` }, update: { value: { down, at: new Date().toISOString() } }, create: { key: `alert-state:${key}`, value: { down, at: new Date().toISOString() }, description: 'Monitoring alert state (internal)' } });
  await notify();
  return true;
}

export const uptimeHandler: Handler = async (ctx) => {
  const sites = await ctx.db.website.findMany({ where: { status: 'LIVE', liveUrl: { startsWith: 'https://' }, archivedAt: null }, select: { id: true, name: true, liveUrl: true, workspace: { select: { owner: { select: { email: true } } } } } });
  const targets = [...sites.map((s) => ({ websiteId: s.id as string | null, url: s.liveUrl!, name: s.name, owner: s.workspace.owner.email }))];
  if (process.env.APP_URL?.startsWith('https://')) targets.push({ websiteId: null, url: `${process.env.APP_URL.replace(/\/$/, '')}/api/health`, name: 'ROI platform', owner: '' });
  let down = 0;
  for (const t of targets) {
    const started = Date.now();
    let status: number | null = null;
    try {
      status = (await safeFetch(t.url, { timeoutMs: 10_000, maxBytes: 200_000 })).status;
    } catch {
      status = null;
    }
    const ok = status !== null && status < 500;
    if (!ok) down++;
    await ctx.db.uptimeCheck.create({ data: { websiteId: t.websiteId, url: t.url, httpStatus: status, ok, latencyMs: Date.now() - started, checkedAt: new Date() } });
    // Two consecutive failures before alerting (one blip is not an outage).
    const recent = await ctx.db.uptimeCheck.findMany({ where: { url: t.url }, orderBy: { checkedAt: 'desc' }, take: 2, select: { ok: true } });
    const isDown = recent.length === 2 && recent.every((r) => !r.ok);
    const isUp = recent[0]?.ok === true;
    if (isDown || isUp) {
      await alertOnce(ctx.db, `uptime:${t.url}`, isDown, async () => {
        const to = [...(t.owner ? [t.owner] : []), ...(await staffEmails(ctx.db))];
        for (const e of to) await sendEmailFromWorker(ctx.db, e, 'admin-alert', { title: isDown ? `${t.name} is DOWN` : `${t.name} is back up`, message: `${t.url}\nStatus: ${status ?? 'no response'} at ${new Date().toISOString()}` });
      });
    }
  }
  await ctx.db.uptimeCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } }); // keep 30 days
  await log(ctx.db, ctx.jobId, 'info', 'Uptime checks', { checked: targets.length, down });
  return { deliverables: 0, costMillicents: 0 };
};

export function certificateExpiry(host: string, port = 443, timeoutMs = 10_000): Promise<{ validTo: Date; issuer: string }> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      if (!cert?.valid_to) return reject(new Error('no certificate'));
      resolve({ validTo: new Date(cert.valid_to), issuer: String((cert.issuer as { O?: string; CN?: string })?.O ?? (cert.issuer as { CN?: string })?.CN ?? '') });
    });
    sock.on('error', reject);
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('timeout'));
    });
  });
}

const THRESHOLDS = [30, 14, 7];
/** Returns the threshold just crossed (30/14/7 days), so each reminder is sent once. */
export function expiryReminder(validTo: Date, lastNotifiedDays: number | null, now = new Date()) {
  const days = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
  const due = THRESHOLDS.filter((t) => days <= t).sort((a, b) => a - b)[0];
  if (due === undefined || (lastNotifiedDays !== null && lastNotifiedDays <= due)) return null;
  return { days, threshold: due };
}

export const sslDomainHandler: Handler = async (ctx) => {
  const domains = await ctx.db.domain.findMany({ where: { websiteId: { not: null }, OR: [{ status: 'ACTIVE' }, { status: 'EXTERNAL' }] }, include: { website: { select: { status: true, workspace: { select: { owner: { select: { email: true } } } } } } } });
  let checked = 0;
  for (const d of domains) {
    const verified = !!(d.verification as { verifiedAt?: string } | null)?.verifiedAt || d.status === 'ACTIVE';
    if (!verified || d.website?.status !== 'LIVE') continue;
    checked++;
    const owner = d.website.workspace.owner.email;
    try {
      const c = await certificateExpiry(d.name);
      await ctx.db.sslCheck.create({ data: { domainId: d.id, host: d.name, validTo: c.validTo, issuer: c.issuer, ok: c.validTo.getTime() > Date.now(), checkedAt: new Date() } });
      const v = (d.verification ?? {}) as { sslNotifiedDays?: number };
      const r = expiryReminder(c.validTo, v.sslNotifiedDays ?? null);
      if (r) {
        await sendEmailFromWorker(ctx.db, owner, 'expiry-alert', { what: `The SSL certificate for ${d.name}`, days: String(r.days) });
        await ctx.db.domain.update({ where: { id: d.id }, data: { verification: { ...(d.verification as object), sslNotifiedDays: r.threshold } } });
      } else if (v.sslNotifiedDays && c.validTo.getTime() - Date.now() > 31 * 86_400_000) {
        await ctx.db.domain.update({ where: { id: d.id }, data: { verification: { ...(d.verification as object), sslNotifiedDays: null } } }); // renewed → reset
      }
    } catch (e) {
      await ctx.db.sslCheck.create({ data: { domainId: d.id, host: d.name, ok: false, issuer: (e as Error).message.slice(0, 120), checkedAt: new Date() } });
    }
    if (d.expiresAt) {
      const v = (d.verification ?? {}) as { domainNotifiedDays?: number };
      const r = expiryReminder(d.expiresAt, v.domainNotifiedDays ?? null);
      if (r) {
        await sendEmailFromWorker(ctx.db, owner, 'expiry-alert', { what: `The domain ${d.name}`, days: String(r.days) });
        await ctx.db.domain.update({ where: { id: d.id }, data: { verification: { ...(d.verification as object), domainNotifiedDays: r.threshold } } });
      }
    }
  }
  await log(ctx.db, ctx.jobId, 'info', 'SSL/domain checks done', { checked });
  return { deliverables: 0, costMillicents: 0 };
};

/** Queue health (spec §19): oldest waiting paid job and recent dead letters → one admin alert per state change. */
export const queueHandler: Handler = async (ctx) => {
  const oldest = await ctx.db.automationJob.findFirst({ where: { status: 'PENDING', lane: { in: ['paid', 'preview'] }, runAt: { lte: new Date() } }, orderBy: { runAt: 'asc' }, select: { runAt: true } });
  const ageMin = oldest ? Math.round((Date.now() - oldest.runAt.getTime()) / 60_000) : 0;
  const dead = await ctx.db.automationJob.count({ where: { status: 'DEAD', updatedAt: { gt: new Date(Date.now() - 60 * 60_000) } } });
  const unhealthy = ageMin > 15 || dead > 0;
  await alertOnce(ctx.db, 'queue', unhealthy, async () => {
    for (const e of await staffEmails(ctx.db)) await sendEmailFromWorker(ctx.db, e, 'admin-alert', { title: unhealthy ? 'Job queue needs attention' : 'Job queue healthy again', message: `Oldest waiting customer job: ${ageMin} min. Dead-lettered in the last hour: ${dead}. See Control Center → Jobs.` });
  });
  return { deliverables: 0, costMillicents: 0 };
};

/**
 * Billing rules (spec Product 5): past due → grace → site SUSPENDED (placeholder page); canceled → suspended after the
 * paid period; paid again → back to LIVE. Data is kept for `billing.dataRetentionDays`.
 */
export const billingEnforceHandler: Handler = async (ctx) => {
  const now = new Date();
  const sites = await ctx.db.website.findMany({ where: { subscriptionId: { not: null }, status: { in: ['LIVE', 'SUSPENDED'] } }, select: { id: true, status: true, name: true, subscriptionId: true, workspace: { select: { owner: { select: { email: true } } } } } });
  let suspended = 0;
  let restored = 0;
  for (const s of sites) {
    const sub = await ctx.db.subscription.findUnique({ where: { id: s.subscriptionId! } });
    if (!sub) continue;
    const lapsed = (sub.status === 'PAST_DUE' && !!sub.graceUntil && sub.graceUntil < now) || (['CANCELED', 'UNPAID'].includes(sub.status) && (!sub.currentPeriodEnd || sub.currentPeriodEnd < now));
    if (lapsed && s.status === 'LIVE') {
      await ctx.db.website.update({ where: { id: s.id }, data: { status: 'SUSPENDED' } });
      await ctx.db.auditLog.create({ data: { action: 'website.suspended', targetType: 'Website', targetId: s.id, data: { subscription: sub.status } } });
      await sendEmailFromWorker(ctx.db, s.workspace.owner.email, 'payment-failed', { product: 'website hosting' });
      suspended++;
    } else if (!lapsed && s.status === 'SUSPENDED' && ['ACTIVE', 'TRIALING'].includes(sub.status)) {
      await ctx.db.website.update({ where: { id: s.id }, data: { status: 'LIVE' } });
      await ctx.db.auditLog.create({ data: { action: 'website.restored', targetType: 'Website', targetId: s.id } });
      restored++;
    }
  }
  // Housekeeping jobs run every few minutes; keep their history for 7 days.
  const pruned = await ctx.db.automationJob.deleteMany({ where: { lane: 'housekeeping', status: 'COMPLETED', type: { startsWith: 'monitor.' }, completedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  await log(ctx.db, ctx.jobId, 'info', 'Billing enforcement', { suspended, restored, prunedJobs: pruned.count });
  return { deliverables: 0, costMillicents: 0 };
};

export const MONITOR_HANDLERS: Record<string, Handler> = {
  'monitor.uptime': uptimeHandler,
  'monitor.ssl-domains': sslDomainHandler,
  'monitor.queue': queueHandler,
  'billing.enforce': billingEnforceHandler,
};
