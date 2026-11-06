import 'server-only';
import { cache } from 'react';
import { formatUsd } from '@roi/shared-utils';
import { db } from './db';

/** Public catalog straight from the database (spec §7: prices, names and descriptions come from the DB). */
export type PublicPlan = { id: string; slug: string; name: string; isDefault: boolean; published: boolean; features: string[]; price: { id: string; amountCents: number; interval: 'ONE_TIME' | 'MONTH' | 'YEAR'; version: number } | null };
export type PublicProduct = Awaited<ReturnType<typeof listPublicProducts>>[number];

function currentPrice<T extends { version: number; activeFrom: Date; activeTo: Date | null }>(prices: T[]): T | null {
  const now = Date.now();
  return prices.filter((p) => p.activeFrom.getTime() <= now && (!p.activeTo || p.activeTo.getTime() > now)).sort((a, b) => b.version - a.version)[0] ?? null;
}

export const listPublicProducts = cache(async () => {
  const rows = await db().product.findMany({
    where: { archivedAt: null, visibility: { in: ['COMING_SOON', 'LIVE'] } },
    orderBy: [{ sortOrder: 'asc' }],
    include: {
      category: true,
      plans: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' }, include: { prices: true, features: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id, number: p.number, slug: p.slug, name: p.name, tagline: p.tagline, shortDescription: p.shortDescription, longDescription: p.longDescription,
    answerFirst: p.answerFirst, honesty: p.honesty, kind: p.kind, visibility: p.visibility, category: { slug: p.category.slug, name: p.category.name },
    faq: (p.faq as Array<{ q: string; a: string }>) ?? [], seoTitle: p.seoTitle, seoDescription: p.seoDescription, updatedAt: p.updatedAt,
    plans: p.plans.map<PublicPlan>((pl) => {
      const cp = currentPrice(pl.prices);
      return { id: pl.id, slug: pl.slug, name: pl.name, isDefault: pl.isDefault, published: pl.published, features: pl.features.map((f) => f.text), price: cp ? { id: cp.id, amountCents: cp.amountCents, interval: cp.interval, version: cp.version } : null };
    }),
  }));
});

export async function getPublicProduct(slug: string) {
  return (await listPublicProducts()).find((p) => p.slug === slug) ?? null;
}

export function priceLabel(p: Pick<PublicProduct, 'kind' | 'plans'>): string {
  if (p.kind === 'QUOTE') return 'Custom quote';
  if (p.kind === 'PER_ITEM') return 'Priced per book';
  const priced = p.plans.filter((pl) => pl.published && pl.price && pl.price.amountCents > 0);
  if (!priced.length) return p.plans.some((pl) => pl.price?.amountCents === 0 && pl.published) ? 'Free audit · plans coming soon' : 'Pricing coming soon';
  const min = priced.reduce((a, b) => (a.price!.amountCents <= b.price!.amountCents ? a : b));
  const suffix = min.price!.interval === 'MONTH' ? '/mo' : min.price!.interval === 'YEAR' ? '/yr' : '';
  return `${priced.length > 1 ? 'From ' : ''}${formatUsd(min.price!.amountCents)}${suffix}`;
}

export function intervalLabel(i: 'ONE_TIME' | 'MONTH' | 'YEAR') {
  return i === 'MONTH' ? '/month' : i === 'YEAR' ? '/year' : ' one-time';
}

export const getSetting = cache(async <T,>(key: string, fallback: T): Promise<T> => {
  const s = await db().setting.findUnique({ where: { key } });
  return (s?.value as T) ?? fallback;
});

export const getFlag = cache(async (key: string) => {
  const f = await db().featureFlag.findUnique({ where: { key } });
  return f?.visibility ?? 'HIDDEN';
});
