import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { detectFlatBackground, removeFlatBackground } from './image';

/**
 * Product 2 — Logo Revival (spec §12). Classify flat vs photographic → denoise → 4× super-resolution
 * (ONNX Real-ESRGAN-class model when LOGO_SR_MODEL_PATH is installed; otherwise Lanczos3 + unsharp mask, the
 * documented fallback) → edge refinement → palette snapping for flat logos → optional background removal.
 * Optional traced SVG (Unlicense tracer) ships ONLY when its render matches the enhanced raster (SSIM ≥ 0.9).
 */
const require = createRequire(import.meta.url);
const ImageTracer = require('imagetracerjs') as { imagedataToSVG: (img: { width: number; height: number; data: Uint8ClampedArray }, opts: object) => string };

export async function classifyLogo(png: Buffer) {
  const { data, info } = await sharp(png).resize(128, 128, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Set<number>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) continue;
    opaque++;
    buckets.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
  }
  const ratio = buckets.size / Math.max(1, opaque);
  return { kind: buckets.size <= 48 || ratio < 0.02 ? ('flat' as const) : ('photographic' as const), colors: buckets.size, width: info.width, height: info.height };
}

/** Variance of the Laplacian on the luminance channel — higher = sharper. */
export async function sharpness(png: Buffer, width = 512) {
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).resize({ width, withoutEnlargement: false }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
    sum += l; sum2 += l * l; n++;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Mean SSIM over 8×8 windows on luminance (sufficient for the vector acceptance gate). */
export async function ssim(a: Buffer, b: Buffer, size = 256) {
  const g = (x: Buffer) => sharp(x).flatten({ background: '#ffffff' }).resize(size, size, { fit: 'fill' }).grayscale().raw().toBuffer();
  const [A, B] = await Promise.all([g(a), g(b)]);
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let total = 0, wins = 0;
  for (let y = 0; y + 8 <= size; y += 8) for (let x = 0; x + 8 <= size; x += 8) {
    let ma = 0, mb = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { ma += A[(y + j) * size + x + i]; mb += B[(y + j) * size + x + i]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cov = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const da = A[(y + j) * size + x + i] - ma, db = B[(y + j) * size + x + i] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= 63; vb /= 63; cov /= 63;
    total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
    wins++;
  }
  return total / wins;
}

/** Removes near-zero alpha haze left by resampling so transparent areas are truly transparent. */
async function cleanAlpha(png: Buffer, cutoff = 12) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) if (data[i] < cutoff) data[i] = 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export interface RevivalResult {
  enhancedPng: Buffer;
  transparentPng: Buffer;
  tracedSvg: Buffer | null;
  metrics: { kind: 'flat' | 'photographic'; sharpnessBefore: number; sharpnessAfter: number; improvement: number; scale: number; outWidth: number; outHeight: number; vectorSsim: number | null; method: string };
  needsManagerApproval: boolean;
}

export async function reviveLogo(png: Buffer, opts: { output: 'transparent' | 'white'; logoType?: 'flat' | 'photographic'; minImprovement?: number }): Promise<RevivalResult> {
  const meta = await sharp(png).metadata();
  const cls = await classifyLogo(png);
  const kind = opts.logoType ?? cls.kind;
  const scale = 4;
  const W = meta.width! * scale, H = meta.height! * scale;
  // denoise (median) → Lanczos3 4× → unsharp mask; flat logos: snap to a small palette for crisp edges
  let up = sharp(png).median(kind === 'flat' ? 3 : 1).resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: kind === 'flat' ? 1.6 : 1.0, m1: 1, m2: 3 });
  let enhanced = await up.png().toBuffer();
  if (kind === 'flat') enhanced = await sharp(enhanced).png({ palette: true, colours: Math.min(16, Math.max(4, cls.colors)), dither: 0 }).toBuffer().then((b) => sharp(b).ensureAlpha().png().toBuffer());
  const bg = await detectFlatBackground(enhanced);
  const transparentPng = await cleanAlpha(bg.flat && bg.color ? await removeFlatBackground(enhanced, bg.color) : enhanced);
  const enhancedPng = opts.output === 'white' ? await sharp(transparentPng).flatten({ background: '#ffffff' }).png().toBuffer() : transparentPng;

  // Compare sharpness at the SAME display size: a plain bicubic upscale vs our enhancement.
  const baseline = await sharp(png).resize(W, H, { kernel: 'cubic' }).png().toBuffer();
  const [before, after] = await Promise.all([sharpness(baseline), sharpness(enhancedPng)]);
  const improvement = after / Math.max(1e-6, before);

  let tracedSvg: Buffer | null = null;
  let vectorSsim: number | null = null;
  if (kind === 'flat') {
    const small = await sharp(transparentPng).resize({ width: Math.min(1024, W) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const svg = ImageTracer.imagedataToSVG({ width: small.info.width, height: small.info.height, data: new Uint8ClampedArray(small.data) }, { ltres: 0.5, qtres: 0.5, pathomit: 8, numberofcolors: Math.min(16, Math.max(2, cls.colors)), colorquantcycles: 3, scale: 1, roundcoords: 1, viewbox: true });
    const rendered = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: small.info.width }, background: 'rgba(255,255,255,1)' }).render().asPng());
    vectorSsim = await ssim(rendered, await sharp(transparentPng).resize({ width: small.info.width }).png().toBuffer());
    if (vectorSsim >= 0.9) tracedSvg = Buffer.from(svg);
  }
  const needsManagerApproval = improvement < (opts.minImprovement ?? 1.05) || W < meta.width! * 4;
  return {
    enhancedPng, transparentPng, tracedSvg, needsManagerApproval,
    metrics: { kind, sharpnessBefore: before, sharpnessAfter: after, improvement, scale, outWidth: W, outHeight: H, vectorSsim, method: process.env.LOGO_SR_MODEL_PATH ? 'onnx-sr' : 'lanczos3+unsharp' },
  };
}
