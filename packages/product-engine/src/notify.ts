import type { PrismaClient } from '@roi/database';
import { renderEmail } from '../../email-templates/src/index';

/**
 * Worker-side notifications (spec §10 flow "… delivery registered → email → appears in dashboard", §15).
 * Same rules as the web app: Resend only when RESEND_API_KEY is set, otherwise logged as AWAITING_CONFIGURATION;
 * suppressed addresses are never emailed. Every customer email is mirrored as an in-app notification.
 */
export async function sendEmailFromWorker(db: PrismaClient, to: string, template: string, vars: Record<string, string>) {
  const email = to.trim().toLowerCase();
  if (await db.emailSuppression.findUnique({ where: { email } })) {
    await db.notificationLog.create({ data: { channel: 'email', to: email, template, status: 'SUPPRESSED' } });
    return 'SUPPRESSED';
  }
  const company = (await db.setting.findUnique({ where: { key: 'company' } }))?.value as { postalAddress?: string } | undefined;
  const r = renderEmail(template, vars, { postalAddress: company?.postalAddress || undefined });
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db.notificationLog.create({ data: { channel: 'email', to: email, template, status: 'AWAITING_CONFIGURATION', error: 'RESEND_API_KEY not set' } });
    return 'AWAITING_CONFIGURATION';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'ROI <hello@mail.roictllc.com>', to: [email], reply_to: process.env.EMAIL_REPLY_TO ?? 'roictllc@gmail.com', subject: r.subject, html: r.html, text: r.text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    await db.notificationLog.create({ data: { channel: 'email', to: email, template, status: res.ok ? 'SENT' : 'FAILED', providerId: body.id, error: res.ok ? null : `HTTP ${res.status}` } });
    return res.ok ? 'SENT' : 'FAILED';
  } catch (e) {
    await db.notificationLog.create({ data: { channel: 'email', to: email, template, status: 'FAILED', error: (e as Error).name } });
    return 'FAILED';
  }
}

const appUrl = () => (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');

async function owner(db: PrismaClient, orderItemId: string) {
  return db.orderItem.findUniqueOrThrow({ where: { id: orderItemId }, include: { product: true, order: { include: { user: true } }, deliverables: { where: { isPreview: false } } } });
}

/** Called after a paid job reaches COMPLETED: email + in-app notification with the file list. */
export async function notifyDelivered(db: PrismaClient, orderItemId: string) {
  const it = await owner(db, orderItemId);
  if (it.status !== 'COMPLETED') return;
  const link = `${appUrl()}/dashboard/products`;
  await sendEmailFromWorker(db, it.order.user.email, 'deliverable-ready', { product: it.product.name, fileList: it.deliverables.map((d) => `• ${d.fileName}`).join('\n'), link });
  await db.notification.create({ data: { userId: it.order.userId, title: `${it.product.name} is ready`, body: `${it.deliverables.length} file(s) passed quality checks.`, link: '/dashboard/products' } });
}

/**
 * Called when a paid job dead-letters (spec Product 1 failure rules): customer message, manager alert, and an
 * automatic full refund scheduled 24 h later unless staff resolve the order first.
 */
export async function notifyFailed(db: PrismaClient, orderItemId: string, error: string) {
  const it = await owner(db, orderItemId);
  await db.orderItem.update({ where: { id: it.id }, data: { status: 'FAILED' } });
  await sendEmailFromWorker(db, it.order.user.email, 'failure-notice', { product: it.product.name, refundNote: 'If we cannot fix it within 24 hours you receive an automatic full refund. You do not need to do anything.' });
  await db.notification.create({ data: { userId: it.order.userId, title: `A problem with your ${it.product.name}`, body: 'A manager is reviewing it. If it is not fixed within 24 hours you get a full refund automatically.', link: '/dashboard/orders' } });
  const staff = await db.user.findMany({ where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' }, select: { email: true } });
  for (const s of staff) await sendEmailFromWorker(db, s.email, 'admin-alert', { title: `Delivery failed: ${it.order.orderNumber}`, message: `${it.product.name} failed after all retries.\n\nError: ${error.slice(0, 300)}\n\nResolve in Control Center → Jobs before the automatic refund in 24 hours.` });
  await db.automationJob.upsert({
    where: { idempotencyKey: `${it.id}:auto-refund` },
    update: {},
    create: { type: 'housekeeping.auto-refund', lane: 'housekeeping', priority: 90, workspaceId: it.order.workspaceId, orderItemId: it.id, payload: { orderItemId: it.id, reason: error.slice(0, 300) }, idempotencyKey: `${it.id}:auto-refund`, runAt: new Date(Date.now() + 24 * 3600_000), maxAttempts: 5 },
  });
}
