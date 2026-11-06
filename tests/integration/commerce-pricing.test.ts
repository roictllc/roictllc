import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { handleStripeEvent } from '@/server/commerce';
import { verifyStripeSignature, signForTest } from '@/server/stripe';
import { changePrice, setProductVisibility } from '@/server/pricing';
import { financeSummary } from '@/server/finance';
import { listPublicProducts } from '@/server/catalog';
import { sendEmail } from '@/server/email';
import { makeCustomer, makeOrder, planFor } from './helpers';

describe('Stripe webhooks (spec §9.2)', () => {
  it('signature verification on the raw body with tolerance', () => {
    const body = '{"id":"evt_1"}';
    expect(verifyStripeSignature(body, signForTest(body, 'whsec_test'), 'whsec_test')).toBe(true);
    expect(verifyStripeSignature(body + ' ', signForTest(body, 'whsec_test'), 'whsec_test')).toBe(false);
    expect(verifyStripeSignature(body, signForTest(body, 'whsec_test', Math.floor(Date.now() / 1000) - 1000), 'whsec_test')).toBe(false);
    expect(verifyStripeSignature(body, null, 'whsec_test')).toBe(false);
  });
  it('checkout → order paid → ledger revenue → job queued; duplicates ignored; refunds post negative ledger rows', async () => {
    const { user, ws } = await makeCustomer('pay');
    const order = await makeOrder(ws.id, user.id, 'animated-gif-logo');
    const evt = { id: `evt_${order.id}`, type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: { id: `cs_${order.id}`, mode: 'payment', payment_status: 'paid', payment_intent: `pi_${order.id}`, amount_total: 2100, total_details: { amount_tax: 0 }, metadata: { orderId: order.id } } } };
    expect(await handleStripeEvent(evt, { fetchFees: false })).toBe('processed');
    expect(await handleStripeEvent(evt, { fetchFees: false })).toBe('duplicate');
    const o = await db().order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(o.status).toBe('PROCESSING');
    expect(await db().automationJob.count({ where: { orderItemId: o.items[0].id, type: 'product.animated-gif-logo' } })).toBe(1);
    expect((await db().financialTransaction.findMany({ where: { orderId: order.id, type: 'REVENUE' } })).map((t) => t.amountCents)).toEqual([2100]);
    const refund = { id: `evt_r_${order.id}`, type: 'charge.refunded', created: Math.floor(Date.now() / 1000), data: { object: { payment_intent: `pi_${order.id}`, amount: 2100, amount_refunded: 2100, refunds: { data: [{ id: `re_${order.id}`, amount: 2100, status: 'succeeded' }] } } } };
    await handleStripeEvent(refund, { fetchFees: false });
    expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('REFUNDED');
    expect((await db().financialTransaction.findFirstOrThrow({ where: { orderId: order.id, type: 'REFUND' } })).amountCents).toBe(-2100);
  });
  it('failed invoice → PAST_DUE with grace period from settings', async () => {
    const { ws } = await makeCustomer('dun');
    const { price } = await planFor('landing-page-hosting');
    await db().subscription.create({ data: { workspaceId: ws.id, priceId: price.id, stripeSubscriptionId: `sub_${ws.id}`, status: 'ACTIVE' } });
    await handleStripeEvent({ id: `evt_f_${ws.id}`, type: 'invoice.payment_failed', created: Math.floor(Date.now() / 1000), data: { object: { subscription: `sub_${ws.id}` } } }, { fetchFees: false });
    const s = await db().subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: `sub_${ws.id}` } });
    expect(s.status).toBe('PAST_DUE');
    const days = (s.graceUntil!.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });
  it('finance summary reconciles to ledger rows', async () => {
    const s = await financeSummary(30);
    expect(s.reconciled).toBe(true);
    expect(s.revenue).toBeGreaterThanOrEqual(2100);
  });
});

describe('admin price changes (spec §9.1)', () => {
  it('creates a new version, closes the old one, propagates to the public catalog, keeps subscriptions on their price', async () => {
    const { plan, price: v1, product } = await planFor('animated-gif-logo');
    const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@test.example' } });
    const blocked = await changePrice({ planId: plan.id, amountCents: 90, interval: 'ONE_TIME', reason: 'test', actorId: admin.id });
    expect(blocked.ok).toBe(false);
    const r = await changePrice({ planId: plan.id, amountCents: 2400, interval: 'ONE_TIME', reason: 'Raise to $24', actorId: admin.id });
    expect(r.ok).toBe(true);
    expect(r.ok && r.price.version).toBe(v1.version + 1);
    expect((await db().productPrice.findUniqueOrThrow({ where: { id: v1.id } })).activeTo).not.toBeNull();
    const pub = (await listPublicProducts()).find((p) => p.id === product.id)!;
    expect(pub.plans[0].price!.amountCents).toBe(2400);
  });
  it('LIVE visibility requires connected integrations', async () => {
    const { product } = await planFor('animated-gif-logo');
    const r = await setProductVisibility(product.id, 'LIVE');
    expect(r.ok).toBe(false);
    expect((await setProductVisibility(product.id, 'COMING_SOON')).ok).toBe(true);
  });
});

describe('email without provider (spec §0.2)', () => {
  it('is logged as AWAITING_CONFIGURATION, never silently dropped', async () => {
    delete process.env.RESEND_API_KEY;
    const r = await sendEmail('someone@test.example', 'welcome', { name: 'X', businessName: 'Y' });
    expect(r.status).toBe('AWAITING_CONFIGURATION');
    expect(await db().notificationLog.count({ where: { to: 'someone@test.example', status: 'AWAITING_CONFIGURATION' } })).toBe(1);
  });
});
