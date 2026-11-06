import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

const run = promisify(execFile);

/**
 * Product 4 — E-Book Library (spec §12). Upload validation (page cap, no active content), metadata, preview pages
 * Chapter 1 start … +2 rendered to watermarked IMAGES (no text layer), and buyer-stamped copies for leak tracing.
 */
export class EbookRejected extends Error {}
const ACTIVE = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA|SubmitForm|ImportData)\b/;

export async function validatePdf(buf: Buffer, maxPages = 2000) {
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new EbookRejected('Upload a PDF file.');
  if (buf.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR')) throw new EbookRejected('The file failed the security scan.');
  if (ACTIVE.test(buf.toString('latin1'))) throw new EbookRejected('The PDF contains active content (scripts, launch actions or embedded files). Export a clean PDF and try again.');
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buf, { updateMetadata: false });
  } catch {
    throw new EbookRejected('The PDF could not be read (encrypted or damaged).');
  }
  const pages = doc.getPageCount();
  if (pages < 1 || pages > maxPages) throw new EbookRejected(`The PDF must have 1–${maxPages} pages.`);
  return { pages, title: doc.getTitle() ?? null, author: doc.getAuthor() ?? null };
}

/** Suggests the Chapter 1 start page by looking for "Chapter 1"/"Chapter One" in the text layer (pdftotext). */
export async function suggestChapter1(buf: Buffer, scanPages = 40) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ebk-'));
  try {
    const f = path.join(dir, 'b.pdf');
    await writeFile(f, buf);
    for (let p = 1; p <= scanPages; p++) {
      const { stdout } = await run('pdftotext', ['-f', String(p), '-l', String(p), '-layout', f, '-']).catch(() => ({ stdout: '' }));
      if (/\bchapter\s+(1|one|i)\b/i.test(stdout) && !/contents/i.test(stdout)) return p;
    }
    return 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function renderPreviewPages(buf: Buffer, chapter1StartPage: number, count = 3, width = 900) {
  const { pages } = await validatePdf(buf);
  const first = Math.min(Math.max(1, chapter1StartPage), pages);
  const last = Math.min(pages, first + count - 1);
  const dir = await mkdtemp(path.join(tmpdir(), 'ebk-'));
  try {
    const f = path.join(dir, 'b.pdf');
    await writeFile(f, buf);
    await run('pdftoppm', ['-f', String(first), '-l', String(last), '-png', '-scale-to-x', String(width), '-scale-to-y', '-1', f, path.join(dir, 'p')]);
    const files = (await readdir(dir)).filter((x) => x.startsWith('p') && x.endsWith('.png')).sort();
    const out: Array<{ pageNumber: number; png: Buffer }> = [];
    for (const [i, name] of files.entries()) {
      const img = await readFile(path.join(dir, name));
      const m = await sharp(img).metadata();
      const wm = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}"><defs><pattern id="p" width="320" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><text x="0" y="100" font-family="sans-serif" font-size="44" font-weight="700" fill="rgba(123,63,255,0.16)">PREVIEW · ROI</text></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
      out.push({ pageNumber: first + i, png: await sharp(img).composite([{ input: wm }]).png().toBuffer() });
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Buyer-stamped copy: visible footer on every page + document metadata keywords. */
export async function stampCopy(buf: Buffer, buyer: { name: string; email: string; orderId: string }) {
  const doc = await PDFDocument.load(buf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const label = `Licensed to ${buyer.name} <${buyer.email}> · Order ${buyer.orderId} · Personal use only`;
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = 7;
    page.drawText(label, { x: Math.max(12, (width - font.widthOfTextAtSize(label, size)) / 2), y: 10, size, font, color: rgb(0.45, 0.45, 0.5) });
  }
  doc.setKeywords([`roi-order:${buyer.orderId}`, `roi-buyer:${buyer.email}`]);
  doc.setProducer('ROI LLC e-book delivery');
  return Buffer.from(await doc.save());
}
