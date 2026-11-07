import { HANDLERS, type Handler } from './handlers';
import { LOGO_FLOW_HANDLERS } from './logo-flows';
import { EBOOK_HANDLERS } from './ebook-jobs';
import { log } from './queue';
import { sendEmailFromWorker } from './notify';

/**
 * Automatic refund (spec Product 1 failure rules, Product 2 "auto-refund if quality gates fail twice and no manager
 * override"). Runs 24 h after a paid job dead-lettered. If staff resolved the item in the meantime nothing happens.
 * Without Stripe credentials the job fails (and dead-letters to the admin) instead of pretending a refund happened.
 */
export const autoRefundHandler: Handler = async (ctx) => {
  const it = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId! }, include: { order: { include: { user: true, items: true } }, product: true } });
  if (it.status === 'COMPLETED' || it.status === 'CANCELED') {
    await log(ctx.db, ctx.jobId, 'info', 'Resolved before the deadline: no refund', { status: it.status });
    return { deliverables: 0, costMillicents: 0 };
  }
  if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(it.order.status)) {
    await log(ctx.db, ctx.jobId, 'info', 'Order already refunded');
    return { deliverables: 0, costMillicents: 0 };
  }
  const key = process.env.STRIPE_SECRET_KEY;
  const pi = it.order.stripePaymentIntentId;
  if (!key || !pi) throw new Error('AWAITING_CONFIGURATION: Stripe is not connected or the order has no payment; issue the refund manually.');
  const single = it.order.items.length === 1;
  const body = new URLSearchParams({ payment_intent: pi, reason: 'requested_by_customer', 'metadata[orderItemId]': it.id, 'metadata[auto]': 'delivery-failed-24h' });
  if (!single) body.set('amount', String(it.unitAmountCents * it.quantity));
  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `auto-refund-${it.id}` },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const r = (await res.json()) as { id?: string; amount?: number; error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe refund failed: ${r.error?.message ?? res.status}`);
  await ctx.db.orderItem.update({ where: { id: it.id }, data: { status: 'CANCELED' } });
  await ctx.db.auditLog.create({ data: { action: 'order.auto_refunded', targetType: 'OrderItem', targetId: it.id, data: { refundId: r.id, amount: r.amount } } });
  await sendEmailFromWorker(ctx.db, it.order.user.email, 'refund', { amount: `$${((r.amount ?? 0) / 100).toFixed(2)}`, orderNumber: it.order.orderNumber });
  return { deliverables: 0, costMillicents: 0 };
};

/** Every job type the worker can run. */
export const JOB_HANDLERS: Record<string, Handler> = {
  ...HANDLERS,
  ...LOGO_FLOW_HANDLERS,
  ...EBOOK_HANDLERS,
  'housekeeping.auto-refund': autoRefundHandler,
};

/** Heavy media jobs run one at a time per worker (spec §10 per-type concurrency limits). */
export const JOB_CONCURRENCY: Record<string, number> = {
  'product.animated-gif-logo': 1,
  'product.logo-revival': 1,
  'preview.logo-revival': 1,
  'preview.animated-gif-logo': 2,
  'preview.logo-generator': 2,
  'ebook.ingest': 1,
};
