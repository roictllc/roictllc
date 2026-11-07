import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import sharp from 'sharp';
import { drawFrame, drawWatermark, placeLogo, type Scene, type Style } from './styles';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/**
 * Product 1 pipeline (spec §12): frames drawn with @napi-rs/canvas → PNG sequence → FFmpeg.
 * Outputs: master GIF 1920×1080 30 fps seamless loop (palettegen/paletteuse), email GIF ≤ 600 px ≤ 15 fps
 * ≤ 1 MB (iterative), static PNG fallback (first frame), 10.0 s 1080p H.264 yuv420p +faststart reveal MP4,
 * and a cheap watermarked preview (480 px, 2 s).
 */
export interface RenderOptions {
  style: Style;
  colors: string[];
  background: { kind: 'transparent' | 'solid' | 'keep'; color?: string };
  loopSeconds?: number; // 3–4 s
  speed?: 'slow' | 'normal' | 'fast';
  tagline?: string;
}

async function frames(logo: Image, dir: string, o: { width: number; height: number; fps: number; seconds: number; style: Style; colors: string[]; background: RenderOptions['background']; watermark?: boolean; reveal?: { tagline?: string } }) {
  const canvas = createCanvas(o.width, o.height);
  const ctx = canvas.getContext('2d');
  const box = placeLogo(o.width, o.height, logo, o.reveal ? 0.5 : 0.62);
  const sc: Scene = { ctx, width: o.width, height: o.height, logo, box, colors: o.colors, background: o.background };
  const n = Math.round(o.fps * o.seconds);
  for (let i = 0; i < n; i++) {
    if (o.reveal) {
      drawRevealFrame(sc, o.style, i / o.fps, o.seconds, o.reveal.tagline);
    } else {
      drawFrame(sc, o.style, i / n);
    }
    if (o.watermark) drawWatermark(ctx, o.width, o.height);
    await writeFile(path.join(dir, `${String(i).padStart(5, '0')}.png`), await canvas.encode('png'));
  }
  return n;
}

/** 10-second reveal: dark stage, logo fades/scales in over 1.6 s, style loop plays, tagline appears, hold. */
function drawRevealFrame(sc: Scene, style: Style, sec: number, total: number, tagline?: string) {
  const { ctx, width, height } = sc;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#04050D');
  bg.addColorStop(1, '#120a2a');
  const intro = Math.min(1, sec / 1.6);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * intro);
  const inner = { ...sc, background: { kind: 'transparent' as const } };
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  const layer = createCanvas(width, height);
  const lctx = layer.getContext('2d');
  drawFrame({ ...inner, ctx: lctx }, style, ((sec % 3) / 3) % 1);
  ctx.save();
  ctx.globalAlpha = e;
  const s = 0.85 + 0.15 * e;
  ctx.translate(width / 2, height / 2);
  ctx.scale(s, s);
  ctx.drawImage(layer, -width / 2, -height / 2);
  ctx.restore();
  if (tagline && sec > 2.2) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (sec - 2.2) / 0.8) * (sec > total - 0.6 ? Math.max(0, (total - sec) / 0.6) : 1);
    ctx.fillStyle = '#F2F6FF';
    ctx.font = `600 ${Math.round(height / 22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(tagline, width / 2, sc.box.y + sc.box.h + height * 0.12);
    ctx.restore();
  }
}

async function ff(args: string[]) {
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 64 * 1024 * 1024 });
}

export async function probe(file: string) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,codec_name,pix_fmt,nb_read_frames,r_frame_rate:format=duration,size', '-of', 'json', file]);
  const j = JSON.parse(stdout) as { streams: Array<{ width: number; height: number; codec_name: string; pix_fmt: string; nb_read_frames: string; r_frame_rate: string }>; format: { duration?: string; size: string } };
  const s = j.streams[0];
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, codec: s.codec_name, pixFmt: s.pix_fmt, frames: Number(s.nb_read_frames), fps: den ? num / den : num, duration: Number(j.format.duration ?? 0), size: Number(j.format.size) };
}

async function gifFrom(seqDir: string, fps: number, out: string, o: { width: number; outFps: number; colors: number; transparent: boolean }) {
  const scale = `fps=${o.outFps},scale=${o.width}:-2:flags=lanczos`;
  const palette = path.join(path.dirname(out), `palette-${path.basename(out)}.png`);
  await ff(['-framerate', String(fps), '-i', path.join(seqDir, '%05d.png'), '-vf', `${scale},palettegen=max_colors=${o.colors}:stats_mode=diff${o.transparent ? ':reserve_transparent=1' : ''}`, palette]);
  await ff(['-framerate', String(fps), '-i', path.join(seqDir, '%05d.png'), '-i', palette, '-lavfi', `${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a${o.transparent ? ':alpha_threshold=128' : ''}`, '-loop', '0', out]);
  await rm(palette, { force: true });
}

export interface LogoAnimationResult {
  masterGif: Buffer;
  emailGif: Buffer;
  pngFallback: Buffer;
  revealMp4: Buffer;
  qc: Record<string, unknown>;
}

export async function renderLogoAnimation(logoPng: Buffer, o: RenderOptions, sizes = { master: { w: 1920, h: 1080, fps: 30 }, reveal: { w: 1920, h: 1080, fps: 30, seconds: 10 } }): Promise<LogoAnimationResult> {
  const work = await mkdtemp(path.join(tmpdir(), 'roi-gif-'));
  try {
    const logo = await loadImage(logoPng);
    const speed = o.speed === 'slow' ? 1.25 : o.speed === 'fast' ? 0.8 : 1;
    const loopSeconds = Math.min(4, Math.max(3, (o.loopSeconds ?? 3.2) * speed));
    const transparent = o.background.kind === 'transparent';
    const seq = path.join(work, 'loop');
    await run('mkdir', ['-p', seq]);
    const n = await frames(logo, seq, { width: sizes.master.w, height: sizes.master.h, fps: sizes.master.fps, seconds: loopSeconds, style: o.style, colors: o.colors, background: o.background });

    const masterPath = path.join(work, 'master.gif');
    await gifFrom(seq, sizes.master.fps, masterPath, { width: sizes.master.w, outFps: sizes.master.fps, colors: 256, transparent });

    // Email GIF: iterate colors → fps → width until ≤ 1 MB.
    const emailPath = path.join(work, 'email.gif');
    const attempts = [[600, 15, 128], [600, 15, 96], [600, 12, 64], [600, 10, 48], [480, 10, 48], [400, 10, 32]] as const;
    let emailSize = Infinity;
    let used: readonly number[] = attempts[0];
    for (const [w, f, c] of attempts) {
      await gifFrom(seq, sizes.master.fps, emailPath, { width: Math.min(w, sizes.master.w), outFps: f, colors: c, transparent });
      emailSize = (await stat(emailPath)).size;
      used = [w, f, c];
      if (emailSize <= 1_000_000) break;
    }

    const pngFallback = await sharp(path.join(seq, '00000.png')).resize({ width: Math.min(600, sizes.master.w) }).png({ compressionLevel: 9 }).toBuffer();

    const rseq = path.join(work, 'reveal');
    await run('mkdir', ['-p', rseq]);
    await frames(logo, rseq, { width: sizes.reveal.w, height: sizes.reveal.h, fps: sizes.reveal.fps, seconds: sizes.reveal.seconds, style: o.style, colors: o.colors, background: { kind: 'solid', color: '#04050D' }, reveal: { tagline: o.tagline } });
    const mp4Path = path.join(work, 'reveal.mp4');
    await ff(['-framerate', String(sizes.reveal.fps), '-i', path.join(rseq, '%05d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(sizes.reveal.seconds), mp4Path]);

    // QC (spec Product 1 step 6)
    const [pm, pe, pv] = await Promise.all([probe(masterPath), probe(emailPath), probe(mp4Path)]);
    const first = await sharp(path.join(seq, '00000.png')).raw().toBuffer();
    const last = await sharp(path.join(seq, `${String(n - 1).padStart(5, '0')}.png`)).raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < first.length; i += 16) diff += Math.abs(first[i] - last[i]);
    const loopDiff = diff / (first.length / 16) / 255;
    const qc = {
      master: pm, email: { ...pe, settings: { width: used[0], fps: used[1], colors: used[2] } }, reveal: pv, loopContinuity: loopDiff, frames: n,
      checks: {
        masterDims: pm.width === sizes.master.w && pm.height === sizes.master.h,
        emailUnder1MB: emailSize <= 1_000_000, emailWidthOk: pe.width <= 600, emailFpsOk: pe.fps <= 15,
        revealDims: pv.width === sizes.reveal.w && pv.height === sizes.reveal.h, revealDurationOk: Math.abs(pv.duration - sizes.reveal.seconds) <= 0.1,
        revealCodec: pv.codec === 'h264' && pv.pixFmt === 'yuv420p', loopSeamless: loopDiff < 0.06,
      },
    };
    const failed = Object.entries(qc.checks).filter(([, v]) => !v).map(([k]) => k);
    if (failed.length) throw new Error(`QC failed: ${failed.join(', ')}`);
    return { masterGif: await readFile(masterPath), emailGif: await readFile(emailPath), pngFallback, revealMp4: await readFile(mp4Path), qc };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Cheap pre-payment preview: 480 px, 2 s, 12 fps, watermark baked into pixels. */
export async function renderPreviewGif(logoPng: Buffer, o: RenderOptions) {
  const work = await mkdtemp(path.join(tmpdir(), 'roi-prev-'));
  try {
    const logo = await loadImage(logoPng);
    const seq = path.join(work, 'f');
    await run('mkdir', ['-p', seq]);
    await frames(logo, seq, { width: 480, height: 270, fps: 12, seconds: 2, style: o.style, colors: o.colors, background: o.background.kind === 'transparent' ? { kind: 'solid', color: '#ffffff' } : o.background, watermark: true });
    const out = path.join(work, 'preview.gif');
    await gifFrom(seq, 12, out, { width: 480, outFps: 12, colors: 96, transparent: false });
    return readFile(out);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Watermark verification (spec Product 1 QC): compares a frame against clean and watermarked reference renders
 * of the same frame on the watermark mask pixels.
 */
export async function watermarkPresent(frame: Buffer, logoPng: Buffer, o: RenderOptions, width: number, height: number, t = 0) {
  const logo = await loadImage(logoPng);
  const mk = (wm: boolean) => {
    const c = createCanvas(width, height);
    const ctx = c.getContext('2d');
    drawFrame({ ctx, width, height, logo, box: placeLogo(width, height, logo), colors: o.colors, background: o.background.kind === 'transparent' ? { kind: 'solid', color: '#ffffff' } : o.background }, o.style, t);
    if (wm) drawWatermark(ctx, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };
  const clean = mk(false);
  const marked = mk(true);
  const actual = await sharp(frame).flatten({ background: '#ffffff' }).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  let dClean = 0, dMarked = 0, n = 0;
  for (let i = 0; i < clean.length; i += 4) {
    if (Math.abs(clean[i] - marked[i]) + Math.abs(clean[i + 1] - marked[i + 1]) < 40) continue; // not a mask pixel
    n++;
    dClean += Math.abs(actual[i] - clean[i]) + Math.abs(actual[i + 1] - clean[i + 1]) + Math.abs(actual[i + 2] - clean[i + 2]);
    dMarked += Math.abs(actual[i] - marked[i]) + Math.abs(actual[i + 1] - marked[i + 1]) + Math.abs(actual[i + 2] - marked[i + 2]);
  }
  return n > 0 && dMarked < dClean;
}

/**
 * Stand-alone 10-second reveal video (Product 2 step 6). Preview: 960×540 with the tiled watermark baked in;
 * paid: 1920×1080 clean. H.264 yuv420p +faststart, duration checked with ffprobe.
 */
export async function renderRevealVideo(logoPng: Buffer, o: RenderOptions & { width: number; height: number; fps?: number; seconds?: number; watermark: boolean }) {
  const work = await mkdtemp(path.join(tmpdir(), 'roi-reveal-'));
  const fps = o.fps ?? 30;
  const seconds = o.seconds ?? 10;
  try {
    const logo = await loadImage(logoPng);
    const seq = path.join(work, 'f');
    await run('mkdir', ['-p', seq]);
    await frames(logo, seq, { width: o.width, height: o.height, fps, seconds, style: o.style, colors: o.colors, background: { kind: 'solid', color: '#04050D' }, reveal: { tagline: o.tagline }, watermark: o.watermark });
    const out = path.join(work, 'reveal.mp4');
    await ff(['-framerate', String(fps), '-i', path.join(seq, '%05d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', o.watermark ? '26' : '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(seconds), out]);
    const p = await probe(out);
    const checks = { dims: p.width === o.width && p.height === o.height, duration: Math.abs(p.duration - seconds) <= 0.1, codec: p.codec === 'h264' && p.pixFmt === 'yuv420p' };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (failed.length) throw new Error(`Reveal QC failed: ${failed.join(', ')}`);
    const firstFrame = await readFile(path.join(seq, '00000.png'));
    const midFrame = await readFile(path.join(seq, `${String(Math.floor((fps * seconds) / 2)).padStart(5, '0')}.png`));
    return { mp4: await readFile(out), probe: p, checks, firstFrame, midFrame };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Watermark detection on any rendered frame (used by QC on paid files and previews): the preview watermark is
 * saturated pink (#FF2D95) text at 42% opacity, so a watermarked frame has many pixels in that hue band that a clean
 * frame of a typical logo does not. Returns the fraction of such pixels.
 */
export async function pinkWatermarkRatio(frame: Buffer) {
  const { data, info } = await sharp(frame).flatten({ background: '#04050D' }).resize({ width: 480, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let hit = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 80 && r - g > 50 && b - g > 20 && r > b) hit++;
  }
  return hit / n;
}

/**
 * Paid-file QC (spec Product 1 step 6 "no watermark pixels in paid files"). A customer's own logo may contain
 * magenta, so the frame is compared with the clean source logo: a frame passes when its watermark-hue share is not
 * above what the logo itself contributes (with a small tolerance).
 */
export async function assertNoWatermark(frames: Buffer[], sourcePng: Buffer) {
  const base = await pinkWatermarkRatio(sourcePng);
  const limit = Math.max(0.005, base * 1.2 + 0.003);
  const ratios = await Promise.all(frames.map((f) => pinkWatermarkRatio(f)));
  const bad = ratios.filter((r) => r > limit);
  if (bad.length) throw new Error(`Watermark pixels found in a paid file (${bad[0].toFixed(4)} > ${limit.toFixed(4)})`);
  return { ratios, limit };
}
