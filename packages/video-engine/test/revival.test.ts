import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { classifyLogo, reviveLogo, ssim } from '../src/revival';
import { transparentPng } from './fixtures';

const blurrySmall = async () => sharp(await transparentPng()).resize(160).blur(1.2).png().toBuffer();
const photo = () => sharp({ create: { width: 200, height: 120, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 50 } } }).png().toBuffer();

describe('Logo Revival (Product 2)', () => {
  it('classifies flat vs photographic', async () => {
    expect((await classifyLogo(await transparentPng())).kind).toBe('flat');
    expect((await classifyLogo(await photo())).kind).toBe('photographic');
  });
  it('outputs ≥ 4× pixels, sharper than a plain upscale, transparent + white variants, vector only if SSIM ≥ 0.9', async () => {
    const src = await blurrySmall();
    const r = await reviveLogo(src, { output: 'white' });
    const m = await sharp(r.enhancedPng).metadata();
    expect(m.width).toBe(640);
    expect(r.metrics.improvement).toBeGreaterThan(1.05);
    const { data } = await sharp(r.transparentPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    if (r.tracedSvg) expect(r.metrics.vectorSsim!).toBeGreaterThanOrEqual(0.9);
    else expect(r.metrics.vectorSsim === null || r.metrics.vectorSsim < 0.9).toBe(true);
  }, 60_000);
  it('SSIM is 1 for identical images and lower for different ones', async () => {
    const a = await transparentPng();
    expect(await ssim(a, a)).toBeCloseTo(1, 3);
    expect(await ssim(a, await photo())).toBeLessThan(0.5);
  });
});
