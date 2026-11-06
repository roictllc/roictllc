import sharp from 'sharp';

/**
 * Upload validation + preparation (spec §6 uploads, Product 1 steps 1–2): magic bytes allow-list, size cap,
 * pixel cap (decompression bombs), re-encode to PNG (strips EXIF/payloads), trim margins, flat-background
 * detection and optional removal with feathered alpha, safe-area padding.
 */
export class UploadRejected extends Error {}

export function sniffImage(buf: Buffer): 'png' | 'jpeg' | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export async function validateLogo(buf: Buffer, opts: { maxBytes?: number; minSide?: number; maxPixels?: number } = {}) {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  if (buf.length > maxBytes) throw new UploadRejected(`File is larger than ${Math.round(maxBytes / 1048576)} MB.`);
  if (buf.includes(EICAR)) throw new UploadRejected('The file failed the security scan.');
  const kind = sniffImage(buf);
  if (!kind) throw new UploadRejected('Upload a PNG or JPG image.');
  const meta = await sharp(buf, { limitInputPixels: opts.maxPixels ?? 25_000_000, failOn: 'error' }).metadata().catch(() => {
    throw new UploadRejected('The image could not be read or is too large (max 25 megapixels).');
  });
  if (!meta.width || !meta.height) throw new UploadRejected('The image has no dimensions.');
  if ((meta.pages ?? 1) > 1) throw new UploadRejected('Animated or multi-page images are not accepted.');
  if (meta.width * meta.height > (opts.maxPixels ?? 25_000_000)) throw new UploadRejected('The image is larger than 25 megapixels.');
  if (Math.min(meta.width, meta.height) < (opts.minSide ?? 300)) throw new UploadRejected(`The shortest side must be at least ${opts.minSide ?? 300} px.`);
  // Re-encode: normalizes CMYK JPEGs to sRGB, drops metadata and any trailing payloads.
  const png = await sharp(buf, { limitInputPixels: opts.maxPixels ?? 25_000_000 }).rotate().toColourspace('srgb').ensureAlpha().png().toBuffer();
  return { png, kind, width: meta.width, height: meta.height };
}

export async function detectFlatBackground(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
  if (corners.every((c) => c[3] < 16)) return { flat: true, transparent: true, color: null as null | number[] };
  const ref = corners[0];
  const close = corners.every((c) => Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 30 && c[3] > 240);
  return { flat: close, transparent: false, color: close ? ref.slice(0, 3) : null };
}

/** Flood-fill from the borders through pixels close to the background color; feather the edge. */
export async function removeFlatBackground(png: Buffer, color: number[], tolerance = 40) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const dist = (i: number) => Math.abs(data[i] - color[0]) + Math.abs(data[i + 1] - color[1]) + Math.abs(data[i + 2] - color[2]);
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (bg[p]) continue;
    if (dist(p * 4) > tolerance) continue;
    bg[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (bg[p]) data[p * 4 + 3] = 0;
    else {
      const d = dist(p * 4);
      if (d < tolerance * 2) data[p * 4 + 3] = Math.min(data[p * 4 + 3], Math.round(255 * ((d - tolerance) / tolerance)) || 0) || data[p * 4 + 3]; // feather edge
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

export async function prepareLogo(png: Buffer, opts: { background: 'keep' | 'transparent' | 'solid' }) {
  let out = png;
  const bg = await detectFlatBackground(png);
  if (opts.background !== 'keep' && bg.flat && !bg.transparent && bg.color) out = await removeFlatBackground(png, bg.color);
  if (opts.background !== 'keep' || bg.transparent) out = await sharp(out).trim({ threshold: 1 }).png().toBuffer().catch(() => out);
  return { png: out, flatBackground: bg.flat, removedBackground: out !== png && opts.background !== 'keep' };
}
