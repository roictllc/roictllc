import { Resvg } from '@resvg/resvg-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { ARCHETYPES, generateLogo, type Archetype, type LogoConcept, type LogoInput } from './generate';
import { fingerprint, minDistance, THRESHOLDS, tooSimilar, type Fingerprint } from './fingerprint';

/**
 * Concepts with similarity screening, protected previews and the three packages (spec Product 3).
 */
export interface ScreenedConcept extends LogoConcept {
  fingerprint: Fingerprint;
  report: { checkedCount: number; minDistance: number; thresholds: typeof THRESHOLDS; attempts: number };
}

export async function generateConcepts(input: LogoInput, pool: Fingerprint[], seed: string, count = 3, maxAttempts = 24): Promise<ScreenedConcept[]> {
  const out: ScreenedConcept[] = [];
  const order = [...ARCHETYPES].sort((a, b) => ((seed + a).length * 7919 + a.charCodeAt(0)) % 7 - ((seed + b).length * 7919 + b.charCodeAt(0)) % 7);
  const avoid = (input.avoid ?? '').toLowerCase().split(/[,\s]+/).filter((w) => w.length > 2);
  let attempts = 0;
  for (let i = 0; out.length < count && attempts < maxAttempts; i++) {
    attempts++;
    const archetype = order[i % order.length] as Archetype;
    if (out.some((c) => c.archetype === archetype) && i < order.length) continue;
    const c = generateLogo(input, archetype, `${seed}:${i}`);
    if (avoid.some((w) => c.svg.toLowerCase().includes(w) && !input.companyName.toLowerCase().includes(w))) continue;
    const fp = await fingerprint(c.svg);
    const all = [...pool, ...out.map((o) => o.fingerprint)];
    if (all.some((p) => tooSimilar(fp, p))) continue;
    out.push({ ...c, fingerprint: fp, report: { checkedCount: all.length, minDistance: minDistance(fp, all), thresholds: THRESHOLDS, attempts } });
  }
  if (out.length < count) throw new Error(`Could not produce ${count} sufficiently distinct concepts in ${maxAttempts} attempts — escalate to a manager.`);
  return out;
}

const png = (svg: string, width: number, bg?: string) => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: bg }).render().asPng());

/** ≤ 640 px preview with a dense diagonal watermark baked into pixels + an invisible forensic mark (LSB). */
export async function protectedPreview(svg: string, sessionTag: string, width = 640) {
  const base = png(svg, width, '#FFFFFF');
  const meta = await sharp(base).metadata();
  const w = meta.width!, h = meta.height!;
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><pattern id="p" width="210" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><text x="0" y="40" font-family="sans-serif" font-size="26" font-weight="700" fill="rgba(255,45,149,0.38)" stroke="rgba(255,255,255,0.6)" stroke-width="0.6">ROI PREVIEW</text></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
  const marked = await sharp(base).composite([{ input: Buffer.from(tile), blend: 'over' }]).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  // forensic: repeat the tag's bits in the blue LSB across the image
  const bits = [...Buffer.from(`ROI:${sessionTag}`)].flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));
  const d = marked.data;
  for (let p = 0, k = 0; p < d.length; p += 4, k++) d[p + 2] = (d[p + 2] & 0xfe) | bits[k % bits.length];
  return sharp(d, { raw: { width: marked.info.width, height: marked.info.height, channels: 4 } }).png().toBuffer();
}

export async function readForensicTag(previewPng: Buffer, maxLen = 64) {
  const { data } = await sharp(previewPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bytes: number[] = [];
  for (let b = 0; b < maxLen; b++) {
    let v = 0;
    for (let i = 0; i < 8; i++) v = (v << 1) | (data[(b * 8 + i) * 4 + 2] & 1);
    bytes.push(v);
  }
  const s = Buffer.from(bytes).toString('latin1');
  const m = /ROI:([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1].replace(/ROI.*$/, '') : null;
}

function recolor(svg: string, color: string) {
  return svg.replace(/fill="(?!none)[^"]*"/g, `fill="${color}"`).replace(/stroke="(?!none)[^"]*"/g, `stroke="${color}"`);
}

export async function buildPackage(concept: LogoConcept, pkg: 'basic' | 'professional' | 'premium', input: LogoInput, report: ScreenedConcept['report']) {
  const files: Array<{ name: string; content: Buffer | string }> = [];
  const slug = input.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
  files.push({ name: `${slug}-3000-transparent.png`, content: png(concept.svg, 3000) });
  files.push({ name: `${slug}-3000-white.png`, content: png(concept.svg, 3000, '#FFFFFF') });
  files.push({ name: `${slug}-3000.jpg`, content: await sharp(png(concept.svg, 3000, '#FFFFFF')).jpeg({ quality: 92 }).toBuffer() });
  if (pkg !== 'basic') {
    files.push({ name: `${slug}.svg`, content: concept.svg });
    files.push({ name: `${slug}-black.svg`, content: recolor(concept.svg, '#000000') });
    files.push({ name: `${slug}-white.svg`, content: recolor(concept.svg, '#FFFFFF') });
    files.push({ name: `${slug}-one-color.svg`, content: recolor(concept.svg, concept.palette[0]) });
    const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#FFFFFF"/><g transform="translate(100 ${500 - 400 * (Number(/viewBox="0 0 \d+ (\d+)"/.exec(concept.svg)?.[1] ?? 400) / Number(/viewBox="0 0 (\d+)/.exec(concept.svg)?.[1] ?? 1000))}) scale(${800 / Number(/viewBox="0 0 (\d+)/.exec(concept.svg)?.[1] ?? 1000)})">${concept.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;
    for (const s of [16, 32, 48, 180, 192, 512]) files.push({ name: `favicon/favicon-${s}.png`, content: png(square, s) });
    for (const s of [400, 1080]) files.push({ name: `social/avatar-${s}.png`, content: png(square, s) });
  }
  if (pkg === 'premium') {
    for (const [n, w, h] of [['x-header', 1500, 500], ['facebook-cover', 820, 312], ['linkedin-banner', 1584, 396]] as const) {
      const logo = await sharp(png(concept.svg, Math.round(w * 0.6))).resize({ width: Math.round(w * 0.6), height: Math.round(h * 0.7), fit: 'inside' }).png().toBuffer();
      files.push({ name: `social/${n}.png`, content: await sharp({ create: { width: w, height: h, channels: 4, background: concept.palette[0] } }).composite([{ input: await sharp({ create: { width: w, height: h, channels: 4, background: '#FFFFFF' } }).png().toBuffer(), left: 0, top: 0, blend: 'over' }, { input: logo, gravity: 'center' }]).png().toBuffer() });
    }
    files.push({ name: `${slug}-brand-kit.pdf`, content: await brandKitPdf(concept, input, report) });
    files.push({ name: `${slug}-business-card.pdf`, content: await businessCardPdf(concept, input) });
  }
  files.push({ name: 'LICENSE.txt', content: `On full payment ROI LLC assigns to the purchaser its rights in this logo concept (${concept.seed}).\nFonts: outlined to paths from SIL Open Font License 1.1 typefaces (logo use permitted).\nSimilarity-screened against ${report.checkedCount} ROI-generated/sold marks and reference shapes; minimum distance ${report.minDistance}. This is not a trademark clearance — search the USPTO database (https://tmsearch.uspto.gov/) or consult an attorney before registering.\n` });
  return files;
}

async function brandKitPdf(concept: LogoConcept, input: LogoInput, report: ScreenedConcept['report']) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const img = await doc.embedPng(png(concept.svg, 900, '#FFFFFF'));
  page.drawText(`${input.companyName} — Brand kit`, { x: 50, y: 740, size: 22, font });
  const dims = img.scaleToFit(512, 220);
  page.drawImage(img, { x: 50, y: 480, width: dims.width, height: dims.height });
  page.drawText('Palette', { x: 50, y: 440, size: 14, font });
  concept.palette.forEach((hex, i) => {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
    page.drawRectangle({ x: 50 + i * 120, y: 370, width: 100, height: 56, color: rgb(r, g, b) });
    page.drawText(hex, { x: 50 + i * 120, y: 355, size: 10, font: body });
  });
  const lines = [
    `Typeface: ${concept.fontKey} (SIL Open Font License 1.1), outlined in the logo files.`,
    'Clear space: keep empty space around the logo at least the height of the largest letter.',
    'Minimum size: 120 px wide on screen, 1 inch in print.',
    'Do not: stretch, recolor outside the palette, add effects, rotate, or place on busy photos without a backdrop.',
    `Similarity report: screened against ${report.checkedCount} marks; minimum distance ${report.minDistance} (thresholds pHash<${report.thresholds.phash}, dHash<${report.thresholds.dhash}).`,
    'Not a trademark clearance. Search https://tmsearch.uspto.gov/ before registering.',
  ];
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 300 - i * 22, size: 10, font: body, maxWidth: 512 }));
  return Buffer.from(await doc.save());
}

async function businessCardPdf(concept: LogoConcept, input: LogoInput) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([252, 144]); // 3.5 × 2 in
  const img = await doc.embedPng(png(concept.svg, 600, '#FFFFFF'));
  const d = img.scaleToFit(200, 80);
  page.drawImage(img, { x: (252 - d.width) / 2, y: (144 - d.height) / 2 + 10, width: d.width, height: d.height });
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(input.tagline ?? '', { x: 26, y: 18, size: 7, font: f });
  return Buffer.from(await doc.save());
}
