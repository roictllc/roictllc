import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, buildPackage, contrast, fingerprint, generateConcepts, generateLogo, harmonize, protectedPreview, readForensicTag, rasterize, tooSimilar, type Fingerprint } from '../src';

const input = { companyName: 'Bayview Family Dental', tagline: 'Smiles that last', category: 'dentist', colors: ['#00E5FF', '#7B3FFF'], style: 'modern' as const };

describe('vector engine', () => {
  it.each(ARCHETYPES)('%s produces valid SVG that rasterizes, with text outlined to paths', (a) => {
    const c = generateLogo(input, a, 'seed-1');
    expect(c.svg.startsWith('<svg')).toBe(true);
    expect(c.svg).not.toMatch(/<text\b/); // fonts outlined
    expect(c.svg).not.toMatch(/<script|<image|href="http/); // self-contained, safe
    const png = rasterize(c.svg, 300);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
  it('harmonizer guarantees ≥ 4.5:1 text contrast on white', () => {
    for (const c of ['#00E5FF', '#FFC400', '#F5F5F5', '#123456']) expect(contrast(harmonize([c]).text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  it('is deterministic per seed', () => {
    expect(generateLogo(input, 'emblem', 'x').svg).toBe(generateLogo(input, 'emblem', 'x').svg);
  });
});

describe('uniqueness screening', () => {
  it('500-run test: 500 accepted marks (rejected candidates regenerated) with zero pairs under threshold', async () => {
    const accepted: Fingerprint[] = [];
    let attempts = 0;
    const cats = ['dentist', 'construction', 'marketing', 'law', 'restaurant', 'tech', 'plumbing', 'other'];
    while (accepted.length < 500 && attempts < 1500) {
      const i = attempts++;
      const c = generateLogo({ ...input, companyName: `Company ${i % 97}`, category: cats[i % cats.length] }, ARCHETYPES[i % ARCHETYPES.length], `run-${i}`);
      const fp = await fingerprint(c.svg);
      if (!accepted.some((a) => tooSimilar(fp, a))) accepted.push(fp);
    }
    expect(accepted).toHaveLength(500);
    let pairs = 0;
    for (let i = 0; i < accepted.length; i++) for (let j = i + 1; j < accepted.length; j++) if (tooSimilar(accepted[i], accepted[j])) pairs++;
    expect(pairs).toBe(0);
  }, 180_000);
  it('generates 3 distinct concepts and rejects candidates too close to reserved marks', async () => {
    const first = await generateConcepts(input, [], 'order-1');
    expect(first).toHaveLength(3);
    expect(new Set(first.map((c) => c.archetype)).size).toBe(3);
    const again = await generateConcepts(input, first.map((c) => c.fingerprint), 'order-1');
    for (const c of again) for (const f of first) expect(tooSimilar(c.fingerprint, f.fingerprint)).toBe(false);
  });
});

describe('protected previews', () => {
  it('≤ 640 px, watermark baked, forensic tag recoverable', async () => {
    const c = generateLogo(input, 'icon-horizontal', 's');
    const p = await protectedPreview(c.svg, 'sess123');
    expect((await sharp(p).metadata()).width).toBeLessThanOrEqual(640);
    expect(await readForensicTag(p)).toBe('sess123');
    const clean = await sharp(rasterize(c.svg, 640)).flatten({ background: '#fff' }).raw().toBuffer();
    const marked = await sharp(p).removeAlpha().raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < clean.length; i += 3) if (Math.abs(clean[i] - marked[i]) + Math.abs(clean[i + 1] - marked[i + 1]) + Math.abs(clean[i + 2] - marked[i + 2]) > 30) diff++;
    expect(diff / (clean.length / 3)).toBeGreaterThan(0.05); // dense visible watermark
  });
});

describe('packages', () => {
  it('Basic / Professional / Premium contain exactly the promised files', async () => {
    const [c] = await generateConcepts(input, [], 'pkg');
    const basic = await buildPackage(c, 'basic', input, c.report);
    expect(basic.map((f) => f.name).sort()).toEqual(['LICENSE.txt', 'bayview-family-dental-3000-transparent.png', 'bayview-family-dental-3000-white.png', 'bayview-family-dental-3000.jpg'].sort());
    const pro = await buildPackage(c, 'professional', input, c.report);
    expect(pro.some((f) => f.name.endsWith('.svg'))).toBe(true);
    expect(pro.filter((f) => f.name.startsWith('favicon/'))).toHaveLength(6);
    const prem = await buildPackage(c, 'premium', input, c.report);
    const pdf = prem.find((f) => f.name.endsWith('brand-kit.pdf'))!.content as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const dir = mkdtempSync(path.join(tmpdir(), 'pdf-'));
    writeFileSync(path.join(dir, 'k.pdf'), pdf);
    expect(execFileSync('qpdf', ['--show-npages', path.join(dir, 'k.pdf')]).toString().trim()).toBe('1');
    expect(prem.filter((f) => f.name.startsWith('social/')).length).toBe(5);
    expect((await sharp(prem.find((f) => f.name.endsWith('3000-transparent.png'))!.content as Buffer).metadata()).width).toBe(3000);
  }, 60_000);
});
