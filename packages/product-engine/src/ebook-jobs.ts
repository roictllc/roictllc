import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { EbookRejected, renderPreviewPages, stampCopy, suggestChapter1, validatePdf } from './ebooks';
import { finishOrderItem, storeDeliverable, type Handler } from './handlers';
import { log, step } from './queue';
import { clamdScan } from './scan';

/**
 * Product 4 — E-Book Library jobs (spec §12).
 * `ebook.ingest`: validate (page cap, active content, ClamAV when configured), metadata, Chapter-1 suggestion, cover
 * thumbnail, and preview pages Chapter 1 … +N rendered to watermarked IMAGES. Source stays in the private bucket.
 * `product.ebook-library`: buyer-stamped copy (visible footer + metadata) → the customer's library with a download limit.
 * Each book is sold through its own plan `book-<ebookId>` on the ebook-library product, so prices are versioned, synced to
 * Stripe and protected by the margin guard like every other price.
 */
import { ebookIdFromPlanSlug } from './ebook-plan';
export { bookPlanSlug, ebookIdFromPlanSlug, registerEbookDownload } from './ebook-plan';

export const ebookIngestHandler: Handler = async (ctx) => {
  const p = ctx.payload as { ebookId: string; autoChapter1?: boolean };
  const book = await ctx.db.eBook.findUniqueOrThrow({ where: { id: p.ebookId } });
  if (!book.sourceKey) throw new Error('No source file uploaded');
  const pdf = await ctx.storage.get('private', book.sourceKey);
  const meta = await step(ctx.db, ctx.jobId, 'validate', { bytes: pdf.length }, async () => {
    if (process.env.CLAMAV_HOST) {
      const scan = await clamdScan(pdf, process.env.CLAMAV_HOST, Number(process.env.CLAMAV_PORT ?? 3310));
      if (!scan.clean) throw new EbookRejected(`Security scan: ${scan.signature}`);
    }
    return validatePdf(pdf);
  }).catch(async (e) => {
    if (e instanceof EbookRejected) {
      await ctx.db.eBook.update({ where: { id: book.id }, data: { status: 'REJECTED' } });
      await ctx.db.auditLog.create({ data: { action: 'ebook.rejected', targetType: 'EBook', targetId: book.id, data: { reason: e.message } } });
    }
    throw e;
  });
  const chapter1 = p.autoChapter1 ? await step(ctx.db, ctx.jobId, 'detect-chapter-1', null, () => suggestChapter1(pdf)) : book.chapter1StartPage;
  const cover = await step(ctx.db, ctx.jobId, 'cover', null, async () => {
    const [first] = await renderPreviewPages(pdf, 1, 1, 600, { watermark: false });
    const jpg = await sharp(first.png).resize({ width: 480 }).jpeg({ quality: 82 }).toBuffer();
    const key = `ebooks/${book.id}/cover-${createHash('sha256').update(jpg).digest('hex').slice(0, 10)}.jpg`;
    await ctx.storage.put('private', key, jpg, 'image/jpeg');
    return key;
  });
  const pages = await step(ctx.db, ctx.jobId, 'render-preview', { chapter1, count: book.previewPageCount }, () => renderPreviewPages(pdf, chapter1, book.previewPageCount));
  await step(ctx.db, ctx.jobId, 'store-preview', { pages: pages.map((x) => x.pageNumber) }, async () => {
    await ctx.db.eBookPreviewPage.deleteMany({ where: { ebookId: book.id } });
    for (const pg of pages) {
      const key = `ebooks/${book.id}/preview-${pg.pageNumber}-${createHash('sha256').update(pg.png).digest('hex').slice(0, 10)}.png`;
      await ctx.storage.put('private', key, pg.png, 'image/png');
      await ctx.db.eBookPreviewPage.create({ data: { ebookId: book.id, pageNumber: pg.pageNumber, imageKey: key } });
    }
    return { stored: pages.length };
  });
  await ctx.db.eBook.update({ where: { id: book.id }, data: { pageCount: meta.pages, chapter1StartPage: chapter1, coverKey: cover, status: book.status === 'REJECTED' ? 'DRAFT' : book.status } });
  await log(ctx.db, ctx.jobId, 'info', 'E-book processed', { pages: meta.pages, chapter1, preview: pages.length });
  return { deliverables: 0, costMillicents: 0 };
};

export const ebookPurchaseHandler: Handler = async (ctx) => {
  const started = Date.now();
  const item = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId! }, include: { plan: true, order: { include: { user: true } } } });
  const ebookId = ebookIdFromPlanSlug(item.plan.slug);
  if (!ebookId) throw new Error(`Plan ${item.plan.slug} is not a book`);
  const book = await ctx.db.eBook.findUniqueOrThrow({ where: { id: ebookId } });
  if (!book.sourceKey) throw new Error('Book source missing');
  const buyer = { name: item.order.user.name ?? item.order.user.email, email: item.order.user.email, orderId: item.order.orderNumber };
  const stamped = await step(ctx.db, ctx.jobId, 'stamp', { orderNumber: buyer.orderId }, async () => stampCopy(await ctx.storage.get('private', book.sourceKey!), buyer));
  const slug = book.slug.slice(0, 60);
  const d = await step(ctx.db, ctx.jobId, 'store', null, () => storeDeliverable(ctx, { kind: 'ebook-pdf', fileName: `${slug}.pdf`, body: stamped, mime: 'application/pdf', validation: { stampedFor: buyer.email, order: buyer.orderId, pages: book.pageCount } }));
  const limit = Number((await ctx.db.setting.findUnique({ where: { key: 'ebook.downloadLimit' } }))?.value ?? 5);
  await ctx.db.eBookPurchase.upsert({
    where: { orderItemId: item.id },
    update: { stampedKey: d.storageKey },
    create: { ebookId: book.id, workspaceId: ctx.workspaceId, userId: item.order.userId, orderItemId: item.id, stampedKey: d.storageKey, downloadLimit: limit },
  });
  return { deliverables: 1, costMillicents: await finishOrderItem(ctx, item.productId, 50, started) };
};

export const EBOOK_HANDLERS: Record<string, Handler> = {
  'ebook.ingest': ebookIngestHandler,
  'product.ebook-library': ebookPurchaseHandler,
};
