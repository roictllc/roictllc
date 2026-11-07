import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { billingEnforceHandler, enqueue, expiryReminder, localStorage, scheduleHousekeeping, uptimeHandler } from '@roi/product-engine';
import { makeCustomer } from './helpers';

/** Spec §19 monitoring + Product 5 billing rules. */
const FUTURE = new Date(Date.now() + 365 * 86_400_000);
const ctx = async (type: string) => {
  const job = await enqueue(db(), { type, payload: {}, idempotencyKey: `${type}:${Math.random()}`, runAt: FUTURE });
  return { db: db(), storage: localStorage('/tmp'), jobId: job.id, workspaceId: '', orderItemId: null, payload: {}, computeRateMillicentsPerS: 1 };
};

describe('monitoring', () => {
  it('scheduler enqueues each housekeeping job once per time bucket', async () => {
    const first = await scheduleHousekeeping(db());
    const again = await scheduleHousekeeping(db());
    expect(first).toBeGreaterThanOrEqual(0);
    expect(again).toBe(0);
  });

  it('expiry reminders fire once at 30, 14 and 7 days', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    const at = (d: number) => new Date(now.getTime() + d * 86_400_000 + 3600_000);
    expect(expiryReminder(at(40), null, now)).toBeNull();
    expect(expiryReminder(at(29), null, now)).toEqual({ days: 29, threshold: 30 });
    expect(expiryReminder(at(28), 30, now)).toBeNull();
    expect(expiryReminder(at(13), 30, now)).toEqual({ days: 13, threshold: 14 });
    expect(expiryReminder(at(6), 14, now)).toEqual({ days: 6, threshold: 7 });
    expect(expiryReminder(at(5), 7, now)).toBeNull();
  });

  it('uptime: records checks and alerts once after two consecutive failures (no repeat while still down)', async () => {
    const { ws, user } = await makeCustomer('uptime');
    // .invalid never resolves (RFC 6761), so every check fails without touching the network.
    const site = await db().website.create({ data: { workspaceId: ws.id, name: 'Up Co', industry: 'dentist', status: 'LIVE', design: {}, content: {}, liveUrl: `https://uptime-test-${Date.now()}.invalid/` } });
    const before = await db().notificationLog.count({ where: { to: user.email } });
    await uptimeHandler(await ctx('monitor.uptime'));
    expect(await db().notificationLog.count({ where: { to: user.email } })).toBe(before); // one failure: no alert
    await uptimeHandler(await ctx('monitor.uptime'));
    const checks = await db().uptimeCheck.findMany({ where: { websiteId: site.id } });
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => !c.ok && c.httpStatus === null)).toBe(true);
    const afterDown = await db().notificationLog.count({ where: { to: user.email } });
    expect(afterDown - before).toBe(1);
    await uptimeHandler(await ctx('monitor.uptime'));
    expect(await db().notificationLog.count({ where: { to: user.email } })).toBe(afterDown);
    await db().website.update({ where: { id: site.id }, data: { status: 'ARCHIVED' } });
  });

  it('billing: past grace suspends the site, payment restores it', async () => {
    const { ws } = await makeCustomer('billing');
    const price = await db().productPrice.findFirstOrThrow({ where: { plan: { product: { slug: 'landing-page-hosting' } } } });
    const sub = await db().subscription.create({ data: { workspaceId: ws.id, priceId: price.id, stripeSubscriptionId: `sub_b_${Date.now()}`, status: 'PAST_DUE', graceUntil: new Date(Date.now() - 1000), currentPeriodStart: new Date() } });
    const site = await db().website.create({ data: { workspaceId: ws.id, name: 'Late Co', industry: 'dentist', status: 'LIVE', design: {}, content: {}, subscriptionId: sub.id } });
    await billingEnforceHandler(await ctx('billing.enforce'));
    expect((await db().website.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('SUSPENDED');
    await db().subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', graceUntil: null } });
    await billingEnforceHandler(await ctx('billing.enforce'));
    expect((await db().website.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('LIVE');
  });
});
