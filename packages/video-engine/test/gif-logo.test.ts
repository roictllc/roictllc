import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { detectFlatBackground, prepareLogo, renderLogoAnimation, renderPreviewGif, STYLES, UploadRejected, validateLogo, watermarkPresent } from '../src';
import { cmykJpg, hugePng, opaqueJpg, tinyPng, transparentPng } from './fixtures';

describe('upload validation (Product 1 step 1)', () => {
  it('accepts PNG, JPG and CMYK JPG and re-encodes to sRGB PNG', async () => {
    for (const make of [transparentPng, opaqueJpg, cmykJpg]) {
      const r = await validateLogo(await make());
      expect(r.png.subarray(1, 4).toString()).toBe('PNG');
      expect((await sharp(r.png).metadata()).space).toBe('srgb');
    }
  });
  it('rejects tiny, huge, non-image, polyglot/EICAR inputs', async () => {
    await expect(validateLogo(await tinyPng())).rejects.toBeInstanceOf(UploadRejected);
    await expect(validateLogo(await hugePng())).rejects.toBeInstanceOf(UploadRejected);
    await expect(validateLogo(Buffer.from('%PDF-1.7 not an image'))).rejects.toBeInstanceOf(UploadRejected);
    const eicar = Buffer.concat([await transparentPng(), Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]);
    await expect(validateLogo(eicar)).rejects.toThrow(/security scan/);
  });
  it('detects and removes flat backgrounds', async () => {
    const { png } = await validateLogo(await opaqueJpg());
    expect((await detectFlatBackground(png)).flat).toBe(true);
    const out = await prepareLogo(png, { background: 'transparent' });
    expect(out.removedBackground).toBe(true);
    const { data } = await sharp(out.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // corner pixel transparent
  });
});

describe('every style renders a watermarked preview', () => {
  it.each(STYLES)('%s', async (style) => {
    const { png } = await validateLogo(await transparentPng());
    const gif = await renderPreviewGif(png, { style, colors: ['#00E5FF', '#7B3FFF'], background: { kind: 'transparent' } });
    const m = await sharp(gif, { animated: true }).metadata();
    expect(m.format).toBe('gif');
    expect(m.width).toBe(480);
    expect(m.pages).toBe(24);
    const firstFrame = await sharp(gif, { page: 0 }).png().toBuffer();
    expect(await watermarkPresent(firstFrame, png, { style, colors: ['#00E5FF', '#7B3FFF'], background: { kind: 'transparent' } }, 480, 270)).toBe(true);
  }, 60_000);
});

describe('full deliverable set with ffprobe QC (spec sizes)', () => {
  it('master 1920×1080 GIF, email GIF ≤ 1 MB, PNG fallback, 10.0 s H.264 reveal; no watermark in paid files', async () => {
    const { png } = await validateLogo(await opaqueJpg());
    const prepared = await prepareLogo(png, { background: 'transparent' });
    const opts = { style: 'shine-sweep' as const, colors: ['#00E5FF', '#FF2D95'], background: { kind: 'transparent' as const }, tagline: 'Acme Dental — smiles that last' };
    const r = await renderLogoAnimation(prepared.png, opts);
    const qc = r.qc as { checks: Record<string, boolean>; master: { width: number; height: number; frames: number }; reveal: { duration: number }; email: { size: number } };
    expect(Object.values(qc.checks).every(Boolean)).toBe(true);
    expect(qc.master).toMatchObject({ width: 1920, height: 1080 });
    expect(qc.master.frames).toBeGreaterThanOrEqual(90);
    expect(Math.abs(qc.reveal.duration - 10)).toBeLessThanOrEqual(0.1);
    expect(r.emailGif.length).toBeLessThanOrEqual(1_000_000);
    const paidFrame = await sharp(r.masterGif, { page: 0 }).png().toBuffer();
    expect(await watermarkPresent(paidFrame, prepared.png, opts, 480, 270)).toBe(false);
  }, 240_000);
});
