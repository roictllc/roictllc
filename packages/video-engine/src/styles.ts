import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';

/**
 * Ten animation styles (spec Product 1). Each draws one frame at loop phase t ∈ [0,1). Every style is the full,
 * unmodified logo at t = 0, so the first frame of every GIF shows the complete logo (Outlook shows only frame 1)
 * and loops are seamless (t = 1 ≡ t = 0).
 */
export const STYLES = ['shine-sweep', 'pulse-glow', 'float', 'draw-on', 'particle-assemble', 'glitch-in', 'spotlight', '3d-flip', 'ripple', 'neon-outline'] as const;
export type Style = (typeof STYLES)[number];

export interface Scene {
  ctx: SKRSContext2D;
  width: number;
  height: number;
  logo: Image;
  box: { x: number; y: number; w: number; h: number }; // logo placement (safe area)
  colors: string[];
  background: { kind: 'transparent' | 'solid' | 'keep'; color?: string };
  particles?: Array<{ x: number; y: number; dx: number; dy: number; c: string; s: number }>;
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
const pingpong = (t: number, a: number, b: number) => (t < a ? 0 : t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

export function placeLogo(width: number, height: number, logo: Image, fill = 0.62) {
  const s = Math.min((width * fill) / logo.width, (height * fill) / logo.height);
  const w = logo.width * s;
  const h = logo.height * s;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

function paintBackground(sc: Scene) {
  const { ctx, width, height, background } = sc;
  ctx.clearRect(0, 0, width, height);
  if (background.kind === 'solid' || background.kind === 'keep') {
    ctx.fillStyle = background.color ?? '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
}

function logoLayer(sc: Scene, mutate?: (c: SKRSContext2D, w: number, h: number) => void) {
  const c = createCanvas(Math.ceil(sc.box.w), Math.ceil(sc.box.h));
  const x = c.getContext('2d');
  x.drawImage(sc.logo, 0, 0, sc.box.w, sc.box.h);
  mutate?.(x, c.width, c.height);
  return c;
}

export function initParticles(sc: Scene, count = 2600) {
  const layer = logoLayer(sc);
  const lx = layer.getContext('2d');
  const img = lx.getImageData(0, 0, layer.width, layer.height);
  const step = Math.max(2, Math.round(Math.sqrt((layer.width * layer.height) / count)));
  const out: NonNullable<Scene['particles']> = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < layer.height; y += step) {
    for (let x = 0; x < layer.width; x += step) {
      const i = (y * layer.width + x) * 4;
      if (img.data[i + 3] < 64) continue;
      const ang = rnd() * Math.PI * 2;
      const r = (0.3 + rnd()) * Math.max(sc.width, sc.height) * 0.35;
      out.push({ x: sc.box.x + x, y: sc.box.y + y, dx: Math.cos(ang) * r, dy: Math.sin(ang) * r, c: `rgba(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]},${img.data[i + 3] / 255})`, s: step });
    }
  }
  sc.particles = out;
}

export function drawFrame(sc: Scene, style: Style, t: number) {
  const { ctx, box } = sc;
  const c1 = sc.colors[0] ?? '#00E5FF';
  const c2 = sc.colors[1] ?? '#7B3FFF';
  paintBackground(sc);
  ctx.save();
  switch (style) {
    case 'shine-sweep': {
      const p = ease((t - 0.25) / 0.5);
      const layer = logoLayer(sc, (x, w, h) => {
        if (p <= 0 || p >= 1) return;
        const cx = -w * 0.6 + p * w * 2.2;
        const g = x.createLinearGradient(cx - w * 0.25, 0, cx + w * 0.25, h);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.globalCompositeOperation = 'source-atop';
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      });
      ctx.drawImage(layer, box.x, box.y);
      break;
    }
    case 'pulse-glow': {
      const k = Math.sin(t * Math.PI * 2) ** 2;
      const s = 1 + 0.045 * k;
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.scale(s, s);
      ctx.shadowColor = c1;
      ctx.shadowBlur = 60 * k;
      ctx.drawImage(sc.logo, -box.w / 2, -box.h / 2, box.w, box.h);
      break;
    }
    case 'float': {
      const dy = Math.sin(t * Math.PI * 2) * sc.height * 0.03;
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 20 - dy / 3;
      ctx.drawImage(sc.logo, box.x, box.y + dy, box.w, box.h);
      break;
    }
    case 'draw-on': {
      // full → wipe out → wipe in → hold (seamless)
      const vis = t < 0.15 ? 1 : t < 0.45 ? 1 - ease((t - 0.15) / 0.3) : t < 0.8 ? ease((t - 0.45) / 0.35) : 1;
      if (vis > 0) {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w * vis, box.h);
        ctx.clip();
        ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
        if (vis < 1) {
          ctx.restore();
          ctx.save();
          ctx.fillStyle = c1;
          ctx.shadowColor = c1;
          ctx.shadowBlur = 25;
          ctx.fillRect(box.x + box.w * vis - 3, box.y - box.h * 0.05, 6, box.h * 1.1);
        }
      }
      break;
    }
    case 'particle-assemble': {
      if (!sc.particles) initParticles(sc);
      const k = pingpong(t, 0.15, 0.85) ** 2;
      if (k < 0.002) {
        ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
        break;
      }
      for (const p of sc.particles!) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x + p.dx * k, p.y + p.dy * k, p.s, p.s);
      }
      break;
    }
    case 'glitch-in': {
      const g = pingpong(t, 0.35, 0.6);
      if (g < 0.05) {
        ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
        break;
      }
      const slices = 14;
      const sh = box.h / slices;
      for (let i = 0; i < slices; i++) {
        const off = Math.sin(i * 12.9898 + Math.floor(t * 40) * 78.233) * box.w * 0.08 * g;
        ctx.drawImage(sc.logo, 0, (i * sc.logo.height) / slices, sc.logo.width, sc.logo.height / slices, box.x + off, box.y + i * sh, box.w, sh);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * g;
      ctx.drawImage(sc.logo, box.x - 8 * g, box.y, box.w, box.h);
      break;
    }
    case 'spotlight': {
      ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
      const k = pingpong(t, 0.1, 0.9);
      if (k > 0.01) {
        const cx = box.x + box.w / 2 + Math.sin(t * Math.PI * 2) * box.w * 0.45;
        const g = ctx.createRadialGradient(cx, sc.height / 2, box.h * 0.2, cx, sc.height / 2, box.w * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${0.75 * k})`);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, sc.width, sc.height);
      }
      break;
    }
    case '3d-flip': {
      const cos = Math.cos(t * Math.PI * 2);
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.scale(Math.max(0.02, Math.abs(cos)), 1);
      if (cos < 0) ctx.scale(-1, 1);
      ctx.drawImage(sc.logo, -box.w / 2, -box.h / 2, box.w, box.h);
      if (cos < 0) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
      }
      break;
    }
    case 'ripple': {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      for (let i = 0; i < 3; i++) {
        const ph = (t + i / 3) % 1;
        ctx.beginPath();
        ctx.strokeStyle = i % 2 ? c2 : c1;
        ctx.globalAlpha = (1 - ph) * 0.6;
        ctx.lineWidth = 6;
        ctx.arc(cx, cy, Math.max(box.w, box.h) * (0.4 + ph * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const s = 1 + 0.02 * Math.sin(t * Math.PI * 2);
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.drawImage(sc.logo, -box.w / 2, -box.h / 2, box.w, box.h);
      break;
    }
    case 'neon-outline': {
      const k = 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
      const color = t < 0.5 ? c1 : c2;
      ctx.shadowColor = color;
      for (const blur of [40 * k + 10, 18]) {
        ctx.shadowBlur = blur;
        ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
      }
      ctx.shadowBlur = 0;
      ctx.drawImage(sc.logo, box.x, box.y, box.w, box.h);
      break;
    }
  }
  ctx.restore();
}

/** Dense diagonal tiled watermark BAKED into pixels (previews only). */
export function drawWatermark(ctx: SKRSContext2D, width: number, height: number, text = 'ROI PREVIEW') {
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#FF2D95';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  const size = Math.max(14, Math.round(width / 22));
  ctx.font = `bold ${size}px sans-serif`;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 7);
  const stepX = size * 8;
  const stepY = size * 2.6;
  for (let y = -height; y < height; y += stepY) {
    for (let x = -width; x < width; x += stepX) {
      ctx.fillText(text, x + ((y / stepY) % 2) * (stepX / 2), y);
      ctx.strokeText(text, x + ((y / stepY) % 2) * (stepX / 2), y);
    }
  }
  ctx.restore();
}
