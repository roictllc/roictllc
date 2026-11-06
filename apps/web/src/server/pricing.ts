import 'server-only';
import { guardPriceChange, DEFAULT_COST_MODEL, type CostModel } from '@roi/shared-utils';
import { db } from './db';

/**
 * Price versioning (spec §9.1): each admin edit creates a NEW ProductPrice version and closes the previous one.
 * Existing subscriptions keep referencing their old price row until migrated deliberately.
 * The margin guard (spec §9.3) blocks prices under the minimum unless an override reason is recorded.
 * When Stripe is configured, a matching Stripe Price is created (Stripe prices are immutable too).
 */
export async function costModelFor(productId: string): Promise<CostModel> {
  const m = await db().productCostModel.findUnique({ where: { productId } });
  return m ? { ...DEFAULT_COST_MODEL, ...m } : DEFAULT_COST_MODEL;
}

export async function changePrice(input: { planId: string; amountCents: number; interval: 'ONE_TIME' | 'MONTH' | 'YEAR'; reason: string; overrideReason?: string; actorId: string }) {
  const plan = await db().productPlan.findUniqueOrThrow({ where: { id: input.planId }, include: { product: true, prices: { orderBy: { version: 'desc' }, take: 1 } } });
  const model = await costModelFor(plan.productId);
  const guard = guardPriceChange(input.amountCents, model, input.overrideReason);
  if (!guard.allowed) return { ok: false as const, error: guard.error, margin: guard.result };

  let stripePriceId: string | null = null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (key && input.amountCents > 0) {
    stripePriceId = await createStripePrice(key, { productName: `${plan.product.name} — ${plan.name}`, productKey: `roi_${plan.product.slug}_${plan.slug}`, amountCents: input.amountCents, interval: input.interval, taxCode: plan.product.taxCode });
  }
  const now = new Date();
  const created = await db().$transaction(async (tx) => {
    const last = plan.prices[0];
    if (last && !last.activeTo) await tx.productPrice.update({ where: { id: last.id }, data: { activeTo: now } });
    return tx.productPrice.create({
      data: {
        planId: plan.id, version: (last?.version ?? 0) + 1, amountCents: input.amountCents, interval: input.interval, stripePriceId, activeFrom: now,
        createdById: input.actorId, reason: input.reason, marginBps: guard.result.marginBps, overrideNote: guard.overrideReason,
      },
    });
  });
  return { ok: true as const, price: created, margin: guard.result };
}

async function stripe(key: string, path: string, body?: Record<string, string>, method = body ? 'POST' : 'GET') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2025-10-29.clover' },
    body: body ? new URLSearchParams(body) : undefined, signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${path}: ${(json.error as { message?: string })?.message ?? res.status}`);
  return json;
}

async function createStripePrice(key: string, p: { productName: string; productKey: string; amountCents: number; interval: 'ONE_TIME' | 'MONTH' | 'YEAR'; taxCode: string | null }) {
  const found = (await stripe(key, `products/search?query=${encodeURIComponent(`metadata['roi_key']:'${p.productKey}'`)}`)) as { data: Array<{ id: string }> };
  const productId = found.data[0]?.id ?? ((await stripe(key, 'products', { name: p.productName, 'metadata[roi_key]': p.productKey, ...(p.taxCode ? { tax_code: p.taxCode } : {}) })) as { id: string }).id;
  const body: Record<string, string> = { product: productId, unit_amount: String(p.amountCents), currency: 'usd', tax_behavior: 'exclusive' };
  if (p.interval !== 'ONE_TIME') body['recurring[interval]'] = p.interval === 'MONTH' ? 'month' : 'year';
  return ((await stripe(key, 'prices', body)) as { id: string }).id;
}

/** LIVE requires every required integration CONNECTED (spec §0.2-2); COMING_SOON/HIDDEN are always allowed. */
export async function setProductVisibility(productId: string, visibility: 'HIDDEN' | 'COMING_SOON' | 'LIVE') {
  const product = await db().product.findUniqueOrThrow({ where: { id: productId } });
  if (visibility === 'LIVE') {
    const integrations = await db().integration.findMany({ where: { key: { in: product.requiredIntegrations } } });
    const notReady = product.requiredIntegrations.filter((k) => integrations.find((i) => i.key === k)?.status !== 'CONNECTED');
    if (notReady.length) return { ok: false as const, error: `Connect ${notReady.join(', ')} first — LIVE needs every required integration to pass its live health check.` };
  }
  await db().product.update({ where: { id: productId }, data: { visibility } });
  return { ok: true as const };
}
