import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { bookPlanSlug, ebookIngestHandler, ebookPurchaseHandler, enqueue, localStorage, registerEbookDownload } from '@roi/product-engine';
import { ebookPageUrl, verifyEbookPageSig } from '@/server/ebooks';
import { makeCustomer } from './helpers';

/** Product 4 (spec §12 tests): exactly the preview pages, stamped buyer copy, download limit, signed page URLs. */
const storage = localStorage(mkdtempSync(path.join(tmpdir(), 'roi-ebk-')));

async function bookPdf(pages = 12, chapterAt = 4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([432, 648]);
    p.drawText(i === 1 ? 'The Growth Book' : i === 2 ? 'Contents' : i === chapterAt ? 'Chapter 1: Start Here' : `Page ${i} body text`, { x: 40, y: 560, size: 18, font });
    if (i === 2) p.drawText('Chapter 1 ........ 4', { x: 40, y: 520, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function ctx(type: string, payload: Record<string, unknown>, workspaceId: string | null, orderItemId: string | null = null) {
  const job = await enqueue(db(), { type, payload, idempotencyKey: `${type}:${Math.random()}`, workspaceId, orderItemId });
  return { db: db(), storage, jobId: job.id, workspaceId: workspaceId ?? '', orderItemId, payload, computeRateMillicentsPerS: 1 };
}

describe('E-Book Library', () => {
  it('ingests a PDF: page count, Chapter-1 suggestion, cover and exactly 3 watermarked preview images', async () => {
    const cat = await db().eBookCategory.findFirstOrThrow();
    const key = `ebooks/source/${crypto.randomUUID()}.pdf`;
    await storage.put('private', key, await bookPdf(), 'application/pdf');
    const book = await db().eBook.create({ data: { slug: `growth-${Date.now()}`, title: 'The Growth Book', author: 'A. Author', categoryId: cat.id, description: 'x'.repeat(50), priceCents: 999, sourceKey: key } });
    await ebookIngestHandler(await ctx('ebook.ingest', { ebookId: book.id, autoChapter1: true }, null));
    const b = await db().eBook.findUniqueOrThrow({ where: { id: book.id }, include: { previewPages: { orderBy: { pageNumber: 'asc' } } } });
    expect(b.pageCount).toBe(12);
    expect(b.chapter1StartPage).toBe(4);
    expect(b.coverKey).toBeTruthy();
    expect(b.previewPages.map((p) => p.pageNumber)).toEqual([4, 5, 6]);
    const img = await storage.get('private', b.previewPages[0].imageKey);
    expect((await sharp(img).metadata()).format).toBe('png');
  });

  it('rejects PDFs with active content and marks the book REJECTED', async () => {
    const cat = await db().eBookCategory.findFirstOrThrow();
    const key = `ebooks/source/${crypto.randomUUID()}.pdf`;
    const bad = Buffer.concat([await bookPdf(3, 2), Buffer.from('\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n')]);
    await storage.put('private', key, bad, 'application/pdf');
    const book = await db().eBook.create({ data: { slug: `bad-${Date.now()}`, title: 'Bad', author: 'X', categoryId: cat.id, description: 'x'.repeat(50), priceCents: 999, sourceKey: key } });
    await expect(ebookIngestHandler(await ctx('ebook.ingest', { ebookId: book.id }, null))).rejects.toThrow(/active content/);
    expect((await db().eBook.findUniqueOrThrow({ where: { id: book.id } })).status).toBe('REJECTED');
  });

  it('delivers a buyer-stamped copy, records the purchase and enforces the download limit', async () => {
    const { ws, user } = await makeCustomer('reader');
    await db().user.update({ where: { id: user.id }, data: { name: 'Robin Reader' } });
    const cat = await db().eBookCategory.findFirstOrThrow();
    const key = `ebooks/source/${crypto.randomUUID()}.pdf`;
    await storage.put('private', key, await bookPdf(6, 3), 'application/pdf');
    const book = await db().eBook.create({ data: { slug: `stamp-${Date.now()}`, title: 'Stamp Me', author: 'X', categoryId: cat.id, description: 'x'.repeat(50), priceCents: 999, sourceKey: key, status: 'LIVE', pageCount: 6 } });
    const product = await db().product.findUniqueOrThrow({ where: { slug: 'ebook-library' } });
    const plan = await db().productPlan.create({ data: { productId: product.id, slug: bookPlanSlug(book.id), name: 'Stamp Me' } });
    const price = await db().productPrice.create({ data: { planId: plan.id, version: 1, amountCents: 999, interval: 'ONE_TIME' } });
    const order = await db().order.create({ data: { orderNumber: `T-EBK-${Date.now()}`, workspaceId: ws.id, userId: user.id, status: 'PROCESSING', subtotalCents: 999, totalCents: 999, items: { create: { productId: product.id, planId: plan.id, priceId: price.id, unitAmountCents: 999, status: 'PROCESSING', idempotencyKey: `oi_${Date.now()}` } } }, include: { items: true } });
    const item = order.items[0];
    await ebookPurchaseHandler(await ctx('product.ebook-library', { orderItemId: item.id }, ws.id, item.id));
    const d = await db().generatedDeliverable.findFirstOrThrow({ where: { orderItemId: item.id, kind: 'ebook-pdf' } });
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'roi-st-')), 'b.pdf');
    writeFileSync(p, await storage.get('private', d.storageKey));
    const text = execFileSync('pdftotext', [p, '-']).toString();
    expect(text).toContain(user.email);
    expect(text).toContain(order.orderNumber);
    expect(execFileSync('pdfinfo', [p]).toString()).toContain(`roi-order:${order.orderNumber}`);
    const purchase = await db().eBookPurchase.findUniqueOrThrow({ where: { orderItemId: item.id } });
    await db().eBookPurchase.update({ where: { id: purchase.id }, data: { downloadLimit: 2 } });
    expect((await registerEbookDownload(db(), d.storageKey, { ip: '1.2.3.4' })).ok).toBe(true);
    expect((await registerEbookDownload(db(), d.storageKey, {})).ok).toBe(true);
    expect((await registerEbookDownload(db(), d.storageKey, {})).ok).toBe(false);
    expect(await db().eBookDownload.count({ where: { purchaseId: purchase.id } })).toBe(2);
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('COMPLETED');
  });

  it('sample page URLs are signed and expire', () => {
    const u = new URL(`http://x${ebookPageUrl('page123')}`);
    expect(verifyEbookPageSig('page123', u.searchParams.get('e'), u.searchParams.get('s'))).toBe(true);
    expect(verifyEbookPageSig('page999', u.searchParams.get('e'), u.searchParams.get('s'))).toBe(false);
    expect(verifyEbookPageSig('page123', String(Math.floor(Date.now() / 1000) - 1), u.searchParams.get('s'))).toBe(false);
  });
});
