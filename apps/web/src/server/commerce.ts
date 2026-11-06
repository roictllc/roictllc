import 'server-only';
import { orderNumber } from '@roi/shared-utils';
import { db } from './db';
import { stripeApi } from './stripe';
import { appUrl } from './env';

/**
 * Checkout and Stripe event handling (spec §9, §10, §18). Totals are computed on the server from the database;
 * client-submitted amounts are never used. Every webhook event is stored once (idempotent) and all financial
 * writes for one event happen in a single transaction.
 */
export class CheckoutError extends Error {}

export async function createCheckout(input: { userId: string; workspaceId: string; planId: string; inputs?: object; consentText: string }) {
  const plan = await db().productPlan.findUnique({ where: { id: input.planId }, include: { product: true, prices: { orderBy: { version: 'desc' } } } });
  if (!plan || plan.archivedAt || !plan.published) throw new CheckoutError('This plan is not available.');
  if (plan.product.visibility !== 'LIVE') throw new CheckoutError('This product is not available for purchase yet.');
  const flag = await db().featureFlag.findUnique({ where: { key: 'checkout' } });
  if (flag?.visibility !== 'LIVE') throw new CheckoutError('Checkout is not open yet.');
  const now = Date.now();
  const price = plan.prices.find((p) => p.activeFrom.getTime() <= now && (!p.activeTo || p.activeTo.getTime() > now));
  if (!price || price.amountCents <= 0 || !price.stripePriceId) throw new CheckoutError('This plan has no purchasable price yet.');
  if (plan.product.slug === 'managed-seo' && plan.slug === 'with-roi-website') {
    const site = await db().subscription.findFirst({ where: { workspaceId: input.workspaceId, status: { in: ['ACTIVE', 'TRIALING'] }, price: { plan: { product: { slug: 'landing-page-hosting' } } } } });
    if (!site) throw new CheckoutError('The $19 SEO plan requires an active ROI website subscription. Choose the standalone plan or add a website first.');
  }
  const workspace = await db().businessWorkspace.findUniqueOrThrow({ where: { id: input.workspaceId }, include: { owner: true } });
  const order = await db().order.create({
    data: {
      orderNumber: orderNumber(), workspaceId: input.workspaceId, userId: input.userId, subtotalCents: price.amountCents, totalCents: price.amountCents,
      consentImmediateDelivery: true, consentText: input.consentText, consentAt: new Date(),
      items: { create: { productId: plan.productId, planId: plan.id, priceId: price.id, unitAmountCents: price.amountCents, idempotencyKey: `oi_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...(input.inputs ? { input: { create: { formVersion: 1, data: input.inputs } } } : {}) } },
    },
    include: { items: true },
  });
  let customerId = workspace.stripeCustomerId;
  if (!customerId) {
    customerId = (await stripeApi<{ id: string }>('customers', { email: workspace.owner.email, name: workspace.name, 'metadata[workspaceId]': workspace.id }, { idempotencyKey: `cust_${workspace.id}` })).id;
    await db().businessWorkspace.update({ where: { id: workspace.id }, data: { stripeCustomerId: customerId } });
  }
  const recurring = price.interval !== 'ONE_TIME';
  const session = await stripeApi<{ id: string; url: string }>('checkout/sessions', {
    mode: recurring ? 'subscription' : 'payment', customer: customerId, 'line_items[0][price]': price.stripePriceId, 'line_items[0][quantity]': '1',
    'automatic_tax[enabled]': 'true', 'customer_update[address]': 'auto', success_url: `${appUrl()}/dashboard/orders?paid=${order.orderNumber}`, cancel_url: `${appUrl()}/products/${plan.product.slug}?canceled=1`,
    'metadata[orderId]': order.id, 'metadata[workspaceId]': input.workspaceId, ...(recurring ? { 'subscription_data[metadata][orderId]': order.id, 'subscription_data[metadata][workspaceId]': input.workspaceId } : { 'payment_intent_data[metadata][orderId]': order.id }),
    'consent_collection[terms_of_service]': 'required',
  }, { idempotencyKey: `cs_${order.id}` });
  await db().order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  return { order, url: session.url };
}

type StripeEvent = { id: string; type: string; created: number; data: { object: Record<string, unknown> } };

/** Idempotent event processing. Returns 'duplicate' if the event was already handled. */
export async function handleStripeEvent(evt: StripeEvent, opts: { fetchFees?: boolean } = {}) {
  const existing = await db().webhookEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId: evt.id } } });
  if (existing?.processedAt) return 'duplicate' as const;
  if (!existing) await db().webhookEvent.create({ data: { provider: 'stripe', eventId: evt.id, type: evt.type, payload: evt as unknown as object } });
  const o = evt.data.object as Record<string, any>;
  const at = new Date(evt.created * 1000);
  const graceDays = Number((await db().setting.findUnique({ where: { key: 'billing.graceDays' } }))?.value ?? 7);

  await db().$transaction(async (tx) => {
    switch (evt.type) {
      case 'checkout.session.completed': {
        const orderId = o.metadata?.orderId as string;
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true, price: true } } } });
        if (!order || order.status !== 'PENDING_PAYMENT') break;
        if (o.payment_status !== 'paid' && o.mode === 'payment') break;
        const tax = Number(o.total_details?.amount_tax ?? 0);
        const total = Number(o.amount_total ?? order.totalCents);
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: at, taxCents: tax, totalCents: total, stripePaymentIntentId: (o.payment_intent as string) ?? null } });
        await tx.payment.create({ data: { orderId: order.id, stripePaymentIntentId: (o.payment_intent as string) ?? null, amountCents: total, status: 'succeeded', paidAt: at } });
        for (const it of order.items) {
          await tx.financialTransaction.create({ data: { type: 'REVENUE', amountCents: it.unitAmountCents * it.quantity, occurredAt: at, workspaceId: order.workspaceId, orderId: order.id, productId: it.productId, sourceType: 'order_item', sourceId: it.id } });
          if (it.price.interval === 'ONE_TIME') await tx.revenueEntry.create({ data: { productId: it.productId, orderItemId: it.id, amountCents: it.unitAmountCents * it.quantity, recognizedOn: at } });
          await tx.automationJob.create({ data: { type: `product.${it.product.slug}`, workspaceId: order.workspaceId, orderItemId: it.id, payload: { orderItemId: it.id }, idempotencyKey: `${it.id}:deliver`, lane: 'paid', priority: 10 } });
          await tx.orderItem.update({ where: { id: it.id }, data: { status: 'PROCESSING' } });
        }
        if (tax) await tx.financialTransaction.create({ data: { type: 'TAX', amountCents: tax, occurredAt: at, workspaceId: order.workspaceId, orderId: order.id, sourceType: 'checkout_session', sourceId: o.id as string } });
        if (o.mode === 'subscription' && o.subscription) {
          const it = order.items[0];
          await tx.subscription.upsert({
            where: { stripeSubscriptionId: o.subscription as string }, update: { status: 'ACTIVE' },
            create: { workspaceId: order.workspaceId, priceId: it.priceId, stripeSubscriptionId: o.subscription as string, status: 'ACTIVE', currentPeriodStart: at },
          });
        }
        await tx.order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });
        break;
      }
      case 'invoice.paid': {
        const sub = o.subscription ? await tx.subscription.findUnique({ where: { stripeSubscriptionId: o.subscription as string }, include: { price: true } }) : null;
        if (!sub) break;
        const line = o.lines?.data?.[0]?.period ?? {};
        const periodStart = line.start ? new Date(line.start * 1000) : at;
        const periodEnd = line.end ? new Date(line.end * 1000) : null;
        await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, graceUntil: null } });
        const inv = await tx.invoice.upsert({
          where: { stripeInvoiceId: o.id as string }, update: { status: 'paid', amountPaidCents: Number(o.amount_paid ?? 0) },
          create: { workspaceId: sub.workspaceId, subscriptionId: sub.id, stripeInvoiceId: o.id as string, number: (o.number as string) ?? null, amountDueCents: Number(o.amount_due ?? 0), amountPaidCents: Number(o.amount_paid ?? 0), status: 'paid', hostedInvoiceUrl: (o.hosted_invoice_url as string) ?? null, periodStart, periodEnd },
        });
        const plan = await tx.productPlan.findUniqueOrThrow({ where: { id: sub.price.planId } });
        if (o.billing_reason !== 'subscription_create') {
          await tx.financialTransaction.create({ data: { type: 'REVENUE', amountCents: Number(o.amount_paid ?? 0) - Number(o.tax ?? 0), occurredAt: at, workspaceId: sub.workspaceId, productId: plan.productId, sourceType: 'invoice', sourceId: inv.id } });
        }
        await tx.revenueEntry.create({ data: { productId: plan.productId, subscriptionId: sub.id, amountCents: Number(o.amount_paid ?? 0) - Number(o.tax ?? 0), recognizedOn: periodStart, periodStart, periodEnd } });
        break;
      }
      case 'invoice.payment_failed': {
        if (!o.subscription) break;
        await tx.subscription.updateMany({ where: { stripeSubscriptionId: o.subscription as string }, data: { status: 'PAST_DUE', graceUntil: new Date(at.getTime() + graceDays * 86400_000) } });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const map: Record<string, string> = { active: 'ACTIVE', trialing: 'TRIALING', past_due: 'PAST_DUE', unpaid: 'UNPAID', canceled: 'CANCELED', incomplete: 'INCOMPLETE', incomplete_expired: 'CANCELED', paused: 'SUSPENDED' };
        await tx.subscription.updateMany({
          where: { stripeSubscriptionId: o.id as string },
          data: { status: (evt.type.endsWith('deleted') ? 'CANCELED' : map[o.status as string] ?? 'ACTIVE') as never, cancelAtPeriodEnd: !!o.cancel_at_period_end, canceledAt: o.canceled_at ? new Date((o.canceled_at as number) * 1000) : null, currentPeriodEnd: o.current_period_end ? new Date((o.current_period_end as number) * 1000) : undefined },
        });
        break;
      }
      case 'charge.refunded': {
        const pay = o.payment_intent ? await tx.payment.findUnique({ where: { stripePaymentIntentId: o.payment_intent as string }, include: { order: true } }) : null;
        if (!pay) break;
        for (const r of (o.refunds?.data ?? []) as Array<{ id: string; amount: number; reason?: string; status: string }>) {
          const exists = await tx.refund.findUnique({ where: { stripeRefundId: r.id } });
          if (exists) continue;
          await tx.refund.create({ data: { paymentId: pay.id, stripeRefundId: r.id, amountCents: r.amount, reason: r.reason ?? 'requested', status: r.status } });
          await tx.financialTransaction.create({ data: { type: 'REFUND', amountCents: -r.amount, occurredAt: at, workspaceId: pay.order?.workspaceId, orderId: pay.orderId, sourceType: 'refund', sourceId: r.id } });
        }
        if (pay.orderId) await tx.order.update({ where: { id: pay.orderId }, data: { status: o.amount_refunded >= o.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
        // Affiliate clawback (spec §17)
        if (pay.orderId) await tx.commission.updateMany({ where: { orderId: pay.orderId, status: { in: ['PENDING', 'PAYABLE'] } }, data: { status: 'CLAWED_BACK' } });
        break;
      }
      case 'charge.dispute.created': {
        await tx.auditLog.create({ data: { action: 'stripe.dispute_created', targetType: 'Charge', targetId: o.charge as string, data: { amount: o.amount, reason: o.reason } } });
        break;
      }
      default:
        break;
    }
    await tx.webhookEvent.update({ where: { provider_eventId: { provider: 'stripe', eventId: evt.id } }, data: { processedAt: new Date() } });
  });

  // Fees come from the balance transaction (outside the main transaction; idempotent by balance txn id).
  if (opts.fetchFees !== false && evt.type === 'checkout.session.completed' && o.payment_intent && process.env.STRIPE_SECRET_KEY) {
    try {
      const pi = await stripeApi<{ latest_charge: { balance_transaction: { id: string; fee: number; net: number } } }>(`payment_intents/${o.payment_intent}?expand[]=latest_charge.balance_transaction`);
      const bt = pi.latest_charge.balance_transaction;
      await recordFee(o.payment_intent as string, bt.id, bt.fee, bt.net, at);
    } catch {
      /* retried by the worker's reconciliation job */
    }
  }
  return 'processed' as const;
}

export async function recordFee(paymentIntentId: string, balanceTxnId: string, feeCents: number, netCents: number, at: Date) {
  const pay = await db().payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId }, include: { order: true } });
  if (!pay) return;
  await db().$transaction([
    db().paymentFee.upsert({ where: { stripeBalanceTxnId: balanceTxnId }, update: {}, create: { paymentId: pay.id, stripeBalanceTxnId: balanceTxnId, feeCents, netCents } }),
    db().financialTransaction.upsert({
      where: { sourceType_sourceId_type: { sourceType: 'balance_txn', sourceId: balanceTxnId, type: 'FEE' } }, update: {},
      create: { type: 'FEE', amountCents: -feeCents, occurredAt: at, workspaceId: pay.order?.workspaceId, orderId: pay.orderId, sourceType: 'balance_txn', sourceId: balanceTxnId, category: null },
    }),
  ]);
}
