import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

/**
 * Product 3 — procedural vector logo engine (spec §12). Produces real SVG: geometry seeded per order + procedurally
 * drawn industry motifs (no stock icons), open-licensed fonts (OFL, license files shipped in node_modules/@fontsource)
 * outlined to paths, and an accessible color harmonizer.
 */
const require = createRequire(import.meta.url);
const FONT_FILES = {
  montserrat: '@fontsource/montserrat/files/montserrat-latin-700-normal.woff',
  grotesk: '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff',
  playfair: '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff',
  bebas: '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff',
} as const;
export const FONT_LICENSES = { montserrat: 'OFL-1.1', grotesk: 'OFL-1.1', playfair: 'OFL-1.1', bebas: 'OFL-1.1' };
type FontKey = keyof typeof FONT_FILES;
const fontCache = new Map<FontKey, opentype.Font>();
function font(k: FontKey) {
  let f = fontCache.get(k);
  if (!f) {
    const b = readFileSync(require.resolve(FONT_FILES[k]));
    f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    fontCache.set(k, f);
  }
  return f;
}

export const ARCHETYPES = ['wordmark', 'monogram', 'lettermark-shape', 'icon-horizontal', 'icon-stacked', 'emblem', 'abstract'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export interface LogoInput {
  companyName: string;
  tagline?: string;
  category: string;
  colors: string[];
  style: 'modern' | 'classic' | 'playful' | 'bold' | 'minimal' | 'elegant';
  avoid?: string;
}
export interface LogoConcept {
  seed: string;
  archetype: Archetype;
  svg: string;
  palette: string[];
  fontKey: FontKey;
  params: Record<string, unknown>;
}

export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ── color ─────────────────────────────────────────────────────────────────
const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (h: string) => {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function darken(h: string, f: number) {
  const [r, g, b] = hexToRgb(h);
  return rgbToHex(r * f, g * f, b * f);
}
/** Ensures the text color reaches ≥ 4.5:1 on white; derives an accent and a dark neutral. */
export function harmonize(colors: string[]) {
  const base = colors[0] ?? '#2A6FDB';
  let text = colors.find((c) => contrast(c, '#FFFFFF') >= 4.5) ?? base;
  let f = 0.9;
  while (contrast(text, '#FFFFFF') < 4.5 && f > 0.2) {
    text = darken(base, f);
    f -= 0.1;
  }
  const accent = colors[1] ?? colors[0] ?? '#7B3FFF';
  return { primary: base, accent, text, dark: '#111827' };
}

// ── text outlining ────────────────────────────────────────────────────────
function textPath(k: FontKey, text: string, x: number, baseline: number, size: number, opts: { tracking?: number; anchor?: 'start' | 'middle' } = {}) {
  const f = font(k);
  const tr = (opts.tracking ?? 0) * size;
  const glyphs = f.stringToGlyphs(text);
  let width = 0;
  glyphs.forEach((g, i) => {
    width += ((g.advanceWidth ?? 0) / f.unitsPerEm) * size + (i < glyphs.length - 1 ? tr : 0);
  });
  let cx = opts.anchor === 'middle' ? x - width / 2 : x;
  const parts: string[] = [];
  glyphs.forEach((g) => {
    parts.push(g.getPath(cx, baseline, size).toPathData(2));
    cx += ((g.advanceWidth ?? 0) / f.unitsPerEm) * size + tr;
  });
  return { d: parts.join(''), width };
}

// ── marks ─────────────────────────────────────────────────────────────────
const MOTIFS: Record<string, (r: () => number, c: string, a: string) => string> = {
  dentist: (r, c, a) => `<path d="M30 22c-8-6-20-2-20 10 0 10 5 18 8 30 2 7 8 7 9 0l3-12 3 12c1 7 7 7 9 0 3-12 8-20 8-30 0-12-12-16-20-10z" fill="${c}"/><path d="M22 70q18 ${10 + r() * 8} 36 0" stroke="${a}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  construction: (r, c, a) => `<path d="M10 70V40l30-${20 + Math.round(r() * 8)} 30 ${20 + Math.round(r() * 8)}v30z" fill="${c}"/><rect x="${32 + r() * 4}" y="48" width="14" height="22" fill="${a}"/><path d="M6 42l34-28 34 28" stroke="${a}" stroke-width="5" fill="none"/>`,
  marketing: (r, c, a) => `<path d="M10 66l20-20 14 12 26-30" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M56 26h16v16" stroke="${a}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  'real-estate': (r, c, a) => `<path d="M8 44 40 16l32 28" stroke="${c}" stroke-width="7" fill="none" stroke-linejoin="round"/><rect x="18" y="42" width="44" height="30" rx="${2 + r() * 4}" fill="${c}"/><rect x="34" y="52" width="12" height="20" fill="${a}"/>`,
  law: (_r, c, a) => `<path d="M40 10v58M20 70h40M14 26h52" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M14 26l-10 22h20zM66 26l-10 22h20z" fill="${a}"/>`,
  restaurant: (r, c, a) => `<path d="M24 12v26m-8-26v18a8 8 0 0016 0V12M24 38v34" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M54 12c${8 + r() * 4} 6 10 22 2 30v30" stroke="${a}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  fitness: (_r, c, a) => `<rect x="8" y="30" width="10" height="20" rx="3" fill="${c}"/><rect x="62" y="30" width="10" height="20" rx="3" fill="${c}"/><rect x="18" y="36" width="44" height="8" fill="${a}"/>`,
  plumbing: (r, c, a) => `<path d="M40 8C${30 - r() * 6} 26 22 36 22 48a18 18 0 0036 0c0-12-8-22-18-40z" fill="${c}"/><circle cx="34" cy="50" r="5" fill="${a}"/>`,
  hvac: (_r, c, a) => `<path d="M40 8c10 14-10 20 0 34 6-10 14-6 14 6a14 14 0 01-28 0c0-14 14-22 14-40z" fill="${c}"/><path d="M14 66h52" stroke="${a}" stroke-width="5" stroke-linecap="round"/>`,
  landscaping: (r, c, a) => `<path d="M40 72V40" stroke="${a}" stroke-width="5"/><path d="M40 44C${18 - r() * 6} 40 14 20 22 10c10 8 18 20 18 34zm0 0c22-4 26-24 18-34-10 8-18 20-18 34z" fill="${c}"/>`,
  tech: (r, c, a) => `<rect x="14" y="14" width="52" height="52" rx="${8 + r() * 6}" fill="none" stroke="${c}" stroke-width="6"/><path d="M30 34l-8 6 8 6M50 34l8 6-8 6" stroke="${a}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  default: (r, c, a) => `<circle cx="40" cy="40" r="${26 + r() * 6}" fill="${c}"/><path d="M26 44l10 10 20-24" stroke="${a}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

function superformula(r: () => number, cx: number, cy: number, size: number) {
  const m = 3 + Math.floor(r() * 6);
  const n1 = 0.3 + r() * 2;
  const n2 = 0.3 + r() * 2;
  const n3 = 0.3 + r() * 2;
  const pts: string[] = [];
  let max = 0;
  const raw: Array<[number, number]> = [];
  for (let i = 0; i < 180; i++) {
    const phi = (i / 180) * Math.PI * 2;
    const t1 = Math.abs(Math.cos((m * phi) / 4)) ** n2;
    const t2 = Math.abs(Math.sin((m * phi) / 4)) ** n3;
    const rr = (t1 + t2) ** (-1 / n1);
    raw.push([rr * Math.cos(phi), rr * Math.sin(phi)]);
    max = Math.max(max, Math.abs(rr));
  }
  for (const [x, y] of raw) pts.push(`${(cx + (x / max) * size).toFixed(1)},${(cy + (y / max) * size).toFixed(1)}`);
  return `M${pts.join('L')}Z`;
}

function abstractMark(r: () => number, c: string, a: string) {
  const kind = Math.floor(r() * 5);
  if (kind === 0) return `<path d="${superformula(r, 40, 40, 34)}" fill="${c}"/><circle cx="${30 + r() * 20}" cy="${30 + r() * 20}" r="${6 + r() * 8}" fill="${a}"/>`;
  if (kind === 1) {
    const sides = 3 + Math.floor(r() * 5);
    const layers = 2 + Math.floor(r() * 3);
    let out = '';
    for (let L = 0; L < layers; L++) {
      const rad = 34 - L * (24 / layers);
      const rot = r() * Math.PI;
      const pts = Array.from({ length: sides }, (_, i) => {
        const ang = rot + (i / sides) * Math.PI * 2;
        return `${(40 + Math.cos(ang) * rad).toFixed(1)},${(40 + Math.sin(ang) * rad).toFixed(1)}`;
      });
      out += `<polygon points="${pts.join(' ')}" fill="${L % 2 ? a : c}" opacity="${(1 - L * 0.15).toFixed(2)}"/>`;
    }
    return out;
  }
  if (kind === 2) {
    // negative-space cut
    const cut = 8 + r() * 14;
    return `<defs><mask id="m"><rect width="80" height="80" fill="#fff"/><rect x="${20 + r() * 24}" y="-10" width="${cut}" height="100" transform="rotate(${-30 + r() * 60} 40 40)" fill="#000"/></mask></defs><circle cx="40" cy="40" r="34" fill="${c}" mask="url(#m)"/><circle cx="40" cy="40" r="${10 + r() * 6}" fill="${a}"/>`;
  }
  if (kind === 3) {
    // grid mosaic
    const g = 4;
    let out = '';
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) if (r() > 0.35) out += `<rect x="${8 + x * 16}" y="${8 + y * 16}" width="14" height="14" rx="${r() * 7}" fill="${(x + y) % 3 ? c : a}"/>`;
    return out || `<rect x="8" y="8" width="64" height="64" rx="12" fill="${c}"/>`;
  }
  // ribbon
  const k = 10 + r() * 20;
  return `<path d="M10 ${50 - k / 2}C30 ${10 - k} 50 ${70 + k} 70 ${30 + k / 2}" stroke="${c}" stroke-width="${10 + r() * 6}" fill="none" stroke-linecap="round"/><path d="M10 ${60}C30 ${30} 50 ${80} 70 ${45}" stroke="${a}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
}

const STYLE_FONT: Record<LogoInput['style'], FontKey[]> = {
  modern: ['grotesk', 'montserrat'], classic: ['playfair'], playful: ['montserrat', 'grotesk'], bold: ['bebas', 'montserrat'], minimal: ['grotesk', 'montserrat'], elegant: ['playfair'],
};

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 &]/g, ' ').split(/\s+/).filter((w) => w && !/^(and|&|of|the|llc|inc|co)$/i.test(w));
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? 'R').slice(0, 2)).toUpperCase();
}

export function generateLogo(input: LogoInput, archetype: Archetype, seed: string): LogoConcept {
  const r = rng(`${seed}:${archetype}:${input.companyName}`);
  const pal = harmonize(input.colors);
  const fontKey = STYLE_FONT[input.style][Math.floor(r() * STYLE_FONT[input.style].length)];
  const name = input.style === 'bold' ? input.companyName.toUpperCase() : input.companyName;
  const tracking = input.style === 'minimal' || input.style === 'elegant' ? 0.06 : input.style === 'bold' ? 0.03 : 0;
  const motif = (MOTIFS[input.category] ?? MOTIFS.default)(r, pal.primary, pal.accent);
  const rot = Math.round((r() - 0.5) * 30);
  const sc = 0.85 + r() * 0.3;
  const mark = archetype === 'abstract' || r() < 0.35 ? abstractMark(r, pal.primary, pal.accent) : `<g transform="rotate(${rot} 40 40) translate(40 40) scale(${sc.toFixed(3)}) translate(-40 -40)">${motif}</g>`;
  const tag = input.tagline ? input.tagline.slice(0, 60) : '';
  let body = '';
  let W = 1000;
  let H = 400;
  switch (archetype) {
    case 'wordmark': {
      const t = textPath(fontKey, name, 500, 230, 140, { tracking, anchor: 'middle' });
      const scale = Math.min(1, 900 / t.width);
      body = `<g transform="translate(500 0) scale(${scale.toFixed(3)} 1) translate(-500 0)"><path d="${t.d}" fill="${pal.text}"/></g><rect x="${500 - (t.width * scale) / 2}" y="258" width="${(t.width * scale * (0.2 + r() * 0.3)).toFixed(1)}" height="10" fill="${pal.accent}"/>`;
      if (tag) body += `<path d="${textPath('montserrat', tag, 500, 320, 34, { tracking: 0.08, anchor: 'middle' }).d}" fill="${pal.dark}"/>`;
      break;
    }
    case 'monogram': {
      W = 600; H = 600;
      const ini = initials(input.companyName);
      const t = textPath(fontKey, ini, 300, 370, 240, { anchor: 'middle' });
      const shape = r() < 0.5 ? `<circle cx="300" cy="300" r="250" fill="${pal.primary}"/>` : `<rect x="60" y="60" width="480" height="480" rx="${60 + r() * 120}" fill="${pal.primary}"/>`;
      body = `${shape}<path d="${t.d}" fill="#FFFFFF"/>`;
      break;
    }
    case 'lettermark-shape': {
      W = 1000; H = 400;
      const ini = initials(input.companyName)[0];
      const t = textPath(fontKey, ini, 200, 270, 230, { anchor: 'middle' });
      const sides = 4 + Math.floor(r() * 4);
      const pts = Array.from({ length: sides }, (_, i) => {
        const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
        return `${(200 + Math.cos(a) * 170).toFixed(1)},${(200 + Math.sin(a) * 170).toFixed(1)}`;
      });
      const n = textPath(fontKey, name, 420, 240, 90, { tracking });
      body = `<polygon points="${pts.join(' ')}" fill="${pal.primary}"/><path d="${t.d}" fill="#FFFFFF"/><g transform="scale(${Math.min(1, 560 / n.width).toFixed(3)} 1) translate(${(420 * (1 / Math.min(1, 560 / n.width)) - 420).toFixed(1)} 0)"><path d="${n.d}" fill="${pal.text}"/></g>`;
      break;
    }
    case 'icon-horizontal': {
      const n = textPath(fontKey, name, 360, 235, 110, { tracking });
      const s = Math.min(1, 600 / n.width);
      body = `<g transform="translate(40 40) scale(4)">${mark}</g><g transform="translate(360 0) scale(${s.toFixed(3)} 1) translate(-360 0)"><path d="${n.d}" fill="${pal.text}"/></g>`;
      if (tag) body += `<path d="${textPath('montserrat', tag, 360, 300, 30, { tracking: 0.08 }).d}" fill="${pal.dark}"/>`;
      break;
    }
    case 'icon-stacked': {
      W = 800; H = 700;
      const n = textPath(fontKey, name, 400, 560, 100, { tracking, anchor: 'middle' });
      const s = Math.min(1, 720 / n.width);
      body = `<g transform="translate(240 40) scale(4)">${mark}</g><g transform="translate(400 0) scale(${s.toFixed(3)} 1) translate(-400 0)"><path d="${n.d}" fill="${pal.text}"/></g>`;
      if (tag) body += `<path d="${textPath('montserrat', tag, 400, 630, 30, { tracking: 0.08, anchor: 'middle' }).d}" fill="${pal.dark}"/>`;
      break;
    }
    case 'emblem': {
      W = 700; H = 700;
      const n = textPath(fontKey, name.length > 18 ? initials(name) : name, 350, 540, Math.min(70, 900 / Math.max(6, name.length)), { tracking: 0.05, anchor: 'middle' });
      const ring = r() < 0.5;
      body = `<circle cx="350" cy="350" r="320" fill="${ring ? 'none' : pal.primary}" stroke="${pal.primary}" stroke-width="${ring ? 22 : 0}"/><circle cx="350" cy="350" r="280" fill="none" stroke="${ring ? pal.accent : '#FFFFFF'}" stroke-width="6"/><g transform="translate(190 120) scale(4)">${ring ? mark : mark.replaceAll(pal.primary, '#FFFFFF')}</g><path d="${n.d}" fill="${ring ? pal.text : '#FFFFFF'}"/>`;
      break;
    }
    case 'abstract': {
      W = 1000; H = 400;
      const n = textPath(fontKey, name, 360, 235, 100, { tracking });
      const s = Math.min(1, 600 / n.width);
      body = `<g transform="translate(40 40) scale(4)">${abstractMark(r, pal.primary, pal.accent)}</g><g transform="translate(360 0) scale(${s.toFixed(3)} 1) translate(-360 0)"><path d="${n.d}" fill="${pal.text}"/></g>`;
      break;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${input.companyName.replace(/[<>"&]/g, '')} logo">${body}</svg>`;
  return { seed, archetype, svg, palette: [pal.primary, pal.accent, pal.text], fontKey, params: { rot, sc, style: input.style, category: input.category } };
}
