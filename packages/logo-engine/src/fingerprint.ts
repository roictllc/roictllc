import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

/**
 * Fingerprints for uniqueness screening (spec Product 3): perceptual hash (DCT pHash 64-bit), difference hash
 * (dHash 64-bit), Hu moment invariants of the silhouette, layout signature (aspect bucket + ink distribution)
 * and palette signature (quantized hues).
 */
export interface Fingerprint {
  phash: string;
  dhash: string;
  hu: number[];
  layout: string;
  palette: string;
}

export function rasterize(svg: string, width = 256) {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(255,255,255,1)' }).render().asPng());
}

function dct1d(v: number[]) {
  const N = v.length;
  return v.map((_, k) => v.reduce((s, x, n) => s + x * Math.cos((Math.PI / N) * (n + 0.5) * k), 0));
}

async function gray(png: Buffer, w: number, h: number) {
  return sharp(png).flatten({ background: '#ffffff' }).resize(w, h, { fit: 'fill' }).grayscale().raw().toBuffer();
}

const toHex = (bits: number[]) => bits.reduce((s, b, i) => (i % 4 === 3 ? s + ((bits[i - 3] << 3) | (bits[i - 2] << 2) | (bits[i - 1] << 1) | b).toString(16) : s), '');

export async function fingerprint(svg: string): Promise<Fingerprint> {
  const png = rasterize(svg, 256);
  // pHash
  const g32 = await gray(png, 32, 32);
  const rows = Array.from({ length: 32 }, (_, y) => dct1d(Array.from(g32.subarray(y * 32, y * 32 + 32))));
  const cols = Array.from({ length: 32 }, (_, x) => dct1d(rows.map((r) => r[x])));
  const coeffs: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) coeffs.push(cols[x][y]);
  const med = [...coeffs.slice(1)].sort((a, b) => a - b)[31];
  const phash = toHex(coeffs.map((c) => (c > med ? 1 : 0)));
  // dHash
  const g9 = await gray(png, 9, 8);
  const dbits: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dbits.push(g9[y * 9 + x] > g9[y * 9 + x + 1] ? 1 : 0);
  const dhash = toHex(dbits);
  // Hu moments on a 64×64 ink mask
  const g64 = await gray(png, 64, 64);
  let m00 = 0, m10 = 0, m01 = 0;
  const ink = (x: number, y: number) => (g64[y * 64 + x] < 200 ? 1 : 0);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = ink(x, y); m00 += v; m10 += x * v; m01 += y * v; }
  const cx = m10 / (m00 || 1), cy = m01 / (m00 || 1);
  const mu = (p: number, q: number) => { let s = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) s += (x - cx) ** p * (y - cy) ** q * ink(x, y); return s; };
  const eta = (p: number, q: number) => mu(p, q) / Math.pow(m00 || 1, 1 + (p + q) / 2);
  const n20 = eta(2, 0), n02 = eta(0, 2), n11 = eta(1, 1), n30 = eta(3, 0), n12 = eta(1, 2), n21 = eta(2, 1), n03 = eta(0, 3);
  const hu = [
    n20 + n02, (n20 - n02) ** 2 + 4 * n11 ** 2, (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2, (n30 + n12) ** 2 + (n21 + n03) ** 2,
  ].map((h) => -Math.sign(h) * Math.log10(Math.abs(h) + 1e-30));
  // layout + palette
  const meta = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const aspect = meta ? Number(meta[1]) / Number(meta[2]) : 1;
  let left = 0, right = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) (x < 32 ? (left += ink(x, y)) : (right += ink(x, y)));
  const layout = `${aspect > 1.8 ? 'wide' : aspect > 1.1 ? 'land' : 'square'}:${Math.round((left / ((left + right) || 1)) * 10)}`;
  const hues = [...svg.matchAll(/#([0-9A-Fa-f]{6})/g)].map((m) => {
    const [r, gg, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
    if (max - min < 0.08) return 'n';
    const h = max === r ? ((gg - b) / (max - min)) % 6 : max === gg ? (b - r) / (max - min) + 2 : (r - gg) / (max - min) + 4;
    return String(Math.round(((h * 60 + 360) % 360) / 30));
  });
  return { phash, dhash, hu, layout, palette: [...new Set(hues)].sort().join('') };
}

export function hamming(a: string, b: string) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export const THRESHOLDS = { phash: 6, dhash: 6, hu: 0.1 }; // calibrated: recolored near-duplicates measure pHash 0, dHash 2

/** Two marks are "too similar" when both perceptual hashes are close AND the silhouette moments match. */
export function tooSimilar(a: Fingerprint, b: Fingerprint, t = THRESHOLDS) {
  const huD = Math.sqrt(a.hu.reduce((s, v, i) => s + (v - (b.hu[i] ?? 0)) ** 2, 0)) / a.hu.length;
  return hamming(a.phash, b.phash) < t.phash && hamming(a.dhash, b.dhash) < t.dhash && huD < t.hu;
}

export function minDistance(fp: Fingerprint, pool: Fingerprint[]) {
  return pool.reduce((m, p) => Math.min(m, hamming(fp.phash, p.phash) + hamming(fp.dhash, p.dhash)), 128);
}
