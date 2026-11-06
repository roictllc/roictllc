import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EbookRejected, renderPreviewPages, stampCopy, suggestChapter1, validatePdf } from '../src/ebooks';

async function sampleBook(pages = 12) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([432, 648]);
    const text = i === 1 ? 'The Growth Book' : i === 2 ? 'Contents' : i === 4 ? 'Chapter 1 — Start Here' : `Page ${i} body text.`;
    p.drawText(text, { x: 40, y: 560, size: 18, font: f });
  }
  return Buffer.from(await doc.save());
}

const pdftext = (buf: Buffer) => {
  const d = mkdtempSync(path.join(tmpdir(), 'pt-'));
  writeFileSync(path.join(d, 'a.pdf'), buf);
  return execFileSync('pdftotext', [path.join(d, 'a.pdf'), '-']).toString();
};

describe('E-Book pipeline (Product 4)', () => {
  it('validates and rejects active content', async () => {
    expect((await validatePdf(await sampleBook())).pages).toBe(12);
    const js = Buffer.from((await sampleBook()).toString('latin1').replace('%%EOF', '1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF'), 'latin1');
    await expect(validatePdf(js)).rejects.toBeInstanceOf(EbookRejected);
    await expect(validatePdf(Buffer.from('not a pdf'))).rejects.toBeInstanceOf(EbookRejected);
  });
  it('auto-detects Chapter 1 and renders exactly 3 watermarked preview images (no text layer)', async () => {
    const book = await sampleBook();
    const start = await suggestChapter1(book);
    expect(start).toBe(4);
    const pages = await renderPreviewPages(book, start);
    expect(pages.map((p) => p.pageNumber)).toEqual([4, 5, 6]);
    for (const p of pages) expect((await sharp(p.png).metadata()).format).toBe('png');
  });
  it('stamped copy carries the buyer identity on every page', async () => {
    const stamped = await stampCopy(await sampleBook(3), { name: 'Pat Buyer', email: 'pat@example.com', orderId: 'ROI-261106-ABCDE' });
    const txt = pdftext(stamped);
    expect(txt.match(/Licensed to Pat Buyer/g)?.length).toBe(3);
    expect((await PDFDocument.load(stamped)).getKeywords()).toContain('roi-order:ROI-261106-ABCDE');
  });
});
