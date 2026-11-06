import { db } from '@roi/database';
import { randomToken } from '@roi/shared-utils';

export async function makeCustomer(label = 'acme') {
  const tag = `${label}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const user = await db().user.create({ data: { email: `${tag}@test.example`, passwordHash: 'x', role: 'CUSTOMER' } });
  const ws = await db().businessWorkspace.create({ data: { name: `${label} co`, slug: tag, ownerId: user.id } });
  await db().customer.create({ data: { userId: user.id, workspaceId: ws.id } });
  return { user, ws };
}

export async function planFor(productSlug: string, planSlug?: string) {
  const p = await db().product.findUniqueOrThrow({ where: { slug: productSlug }, include: { plans: { include: { prices: { orderBy: { version: 'desc' } } } } } });
  const plan = planSlug ? p.plans.find((x) => x.slug === planSlug)! : p.plans[0];
  return { product: p, plan, price: plan.prices[0] };
}

export async function makeOrder(ws: string, userId: string, productSlug: string, inputs?: object) {
  const { product, plan, price } = await planFor(productSlug);
  return db().order.create({
    data: {
      orderNumber: `T-${randomToken(6)}`, workspaceId: ws, userId, subtotalCents: price.amountCents, totalCents: price.amountCents,
      items: { create: { productId: product.id, planId: plan.id, priceId: price.id, unitAmountCents: price.amountCents, idempotencyKey: `oi_${randomToken(8)}`, ...(inputs ? { input: { create: { formVersion: 1, data: inputs } } } : {}) } },
    },
    include: { items: true },
  });
}
