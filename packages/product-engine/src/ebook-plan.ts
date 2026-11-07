import type { PrismaClient } from '@roi/database';

/** Each e-book is sold through its own plan on the ebook-library product (see ebook-jobs.ts). */
export const bookPlanSlug = (ebookId: string) => `book-${ebookId}`;
export const ebookIdFromPlanSlug = (slug: string) => (slug.startsWith('book-') ? slug.slice(5) : null);

/**
 * Download accounting for "My library" (spec: download limit, default 5, and history). Returns false when the limit is
 * reached. Staff downloads are not counted against the buyer.
 */
export async function registerEbookDownload(db: PrismaClient, storageKey: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const purchase = await db.eBookPurchase.findFirst({ where: { stampedKey: storageKey } });
  if (!purchase) return { ok: true as const, counted: false };
  const updated = await db.eBookPurchase.updateMany({ where: { id: purchase.id, downloadCount: { lt: purchase.downloadLimit } }, data: { downloadCount: { increment: 1 } } });
  if (updated.count === 0) return { ok: false as const, limit: purchase.downloadLimit };
  await db.eBookDownload.create({ data: { purchaseId: purchase.id, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  return { ok: true as const, counted: true, remaining: purchase.downloadLimit - purchase.downloadCount - 1 };
}

