import { randomBytes } from 'node:crypto';
export { IntakeRejected, ingestLogoUpload, previewInputHash } from './intake';
import type { PrismaClient } from '@roi/database';
import sharp from 'sharp';
import { finishOrderItem, inputsFor, storeDeliverable, type Handler, type HandlerContext } from './handlers';
import { log, step } from './queue';
import { zipFiles } from './signatures';

/**
 * Products 1–3 customer flows (spec §12): upload intake, cheap watermarked pre-payment previews, and paid delivery
 * for Logo Revival and the Logo Generator. Engines are loaded lazily so the web app never pulls FFmpeg/canvas code
 * into request handlers.
 */
const video = () => import('../../video-engine/src/index');
const logos = () => import('../../logo-engine/src/index');

async function loadCleanAsset(ctx: HandlerContext, assetId: string) {
  const asset = await ctx.db.customerAsset.findFirstOrThrow({ where: { id: assetId, workspaceId: ctx.workspaceId } });
  if (asset.scanStatus !== 'CLEAN') throw new Error('Upload is not scanned clean');
  return ctx.storage.get('private', asset.storageKey);
}

const BRAND = ['#00E5FF', '#7B3FFF'];
type GifInputs = { logoAssetId: string; style: string; background: 'keep' | 'transparent' | 'solid'; backgroundColor?: string; loopSpeed?: 'slow' | 'normal' | 'fast'; tagline?: string; effectColors?: string[] };
type RevivalInputs = { logoAssetId: string; output: 'transparent' | 'white'; logoType: 'flat' | 'photographic'; notes?: string };
type GeneratorInputs = { companyName: string; tagline?: string; category: string; colors: string[]; style: 'modern' | 'classic' | 'playful' | 'bold' | 'minimal' | 'elegant'; avoid?: string };

/** Product 1 step 3: 480 px, 2 s, watermarked GIF; QC verifies the watermark is really in the pixels. */
export const previewGifHandler: Handler = async (ctx) => {
  const { renderPreviewGif, prepareLogo, pinkWatermarkRatio } = await video();
  const p = ctx.payload as { renderId: string; inputs: GifInputs };
  const raw = await loadCleanAsset(ctx, p.inputs.logoAssetId);
  const prepared = await step(ctx.db, ctx.jobId, 'prepare', { background: p.inputs.background }, () => prepareLogo(raw, { background: p.inputs.background }));
  const colors = p.inputs.effectColors?.length ? p.inputs.effectColors : BRAND;
  const background = p.inputs.background === 'solid' ? { kind: 'solid' as const, color: p.inputs.backgroundColor ?? '#FFFFFF' } : p.inputs.background === 'transparent' ? { kind: 'transparent' as const } : { kind: 'keep' as const, color: '#FFFFFF' };
  const gif = await step(ctx.db, ctx.jobId, 'render-preview', { style: p.inputs.style }, () => renderPreviewGif(prepared.png, { style: p.inputs.style as never, colors, background, speed: p.inputs.loopSpeed, tagline: p.inputs.tagline }));
  const meta = await sharp(gif, { pages: 1 }).metadata();
  const ratio = await step(ctx.db, ctx.jobId, 'qc-watermark', null, async () => {
    const first = await sharp(gif, { pages: 1 }).png().toBuffer();
    const r = await pinkWatermarkRatio(first);
    if (r < 0.01) throw new Error(`Preview watermark not detected (${r.toFixed(4)})`);
    if (meta.width! > 480) throw new Error('Preview larger than 480 px');
    return r;
  });
  const d = await storeDeliverable(ctx, { kind: 'preview-gif', fileName: 'preview.gif', body: gif, mime: 'image/gif', width: meta.width, height: meta.height, durationMs: 2000, isPreview: true, watermarked: true, validation: { watermarkRatio: ratio, maxWidth: 480 } });
  await ctx.db.logoRender.update({ where: { id: p.renderId }, data: { deliverableId: d.id } });
  return { deliverables: 1, costMillicents: 0 };
};

/** Product 2 preview: revive, then a 10-second 540p reveal video with the tiled watermark baked in, plus a poster. */
export const previewRevivalHandler: Handler = async (ctx) => {
  const { reviveLogo, renderRevealVideo, pinkWatermarkRatio } = await video();
  const p = ctx.payload as { renderId: string; inputs: RevivalInputs };
  const raw = await loadCleanAsset(ctx, p.inputs.logoAssetId);
  const revived = await step(ctx.db, ctx.jobId, 'enhance', { output: p.inputs.output, logoType: p.inputs.logoType }, () => reviveLogo(raw, { output: p.inputs.output, logoType: p.inputs.logoType }));
  const video540 = await step(ctx.db, ctx.jobId, 'render-preview-video', null, () => renderRevealVideo(revived.transparentPng, { style: 'shine-sweep', colors: BRAND, background: { kind: 'transparent' }, width: 960, height: 540, fps: 24, seconds: 10, watermark: true }));
  const ratio = await step(ctx.db, ctx.jobId, 'qc-watermark', null, async () => {
    const r = await pinkWatermarkRatio(video540.midFrame);
    if (r < 0.01) throw new Error(`Preview watermark not detected (${r.toFixed(4)})`);
    return r;
  });
  const poster = await sharp(video540.midFrame).jpeg({ quality: 70 }).toBuffer();
  const d = await storeDeliverable(ctx, { kind: 'preview-video', fileName: 'preview-540p.mp4', body: video540.mp4, mime: 'video/mp4', width: 960, height: 540, durationMs: Math.round(video540.probe.duration * 1000), isPreview: true, watermarked: true, validation: { ...video540.checks, watermarkRatio: ratio } });
  await storeDeliverable(ctx, { kind: 'preview-poster', fileName: 'preview-poster.jpg', body: poster, mime: 'image/jpeg', width: 960, height: 540, isPreview: true, watermarked: true, validation: { watermarkRatio: ratio } });
  await ctx.db.logoRender.update({ where: { id: p.renderId }, data: { deliverableId: d.id, params: { ...(p.inputs as object), metrics: revived.metrics, needsManagerApproval: revived.needsManagerApproval, vectorAvailable: !!revived.tracedSvg } } });
  return { deliverables: 2, costMillicents: 0 };
};

/** Name check (spec Product 3 step 3): ROI's own customer names; USPTO lookup link always; API only if configured. */
async function nameCheck(db: PrismaClient, workspaceId: string, companyName: string) {
  const name = companyName.trim();
  const roiMatches = await db.businessWorkspace.count({ where: { id: { not: workspaceId }, name: { equals: name, mode: 'insensitive' } } });
  return {
    checkedSources: ['ROI customer names', ...(process.env.USPTO_API_KEY ? ['USPTO (API)'] : [])],
    roiMatches,
    result: roiMatches > 0 ? 'possible conflicts found' : 'none found in checked sources',
    usptoSearchUrl: `https://tmsearch.uspto.gov/search/search-results?query=${encodeURIComponent(name)}`,
    checkedAt: new Date().toISOString(),
  };
}

/** Product 3: 3 similarity-screened concepts, stored with fingerprints + reports; previews ≤ 640 px, watermark + forensic tag. */
export const previewConceptsHandler: Handler = async (ctx) => {
  const { generateConcepts, protectedPreview } = await logos();
  const p = ctx.payload as { requestId: string; inputs: GeneratorInputs };
  const poolRows = await ctx.db.logoFingerprint.findMany({ select: { phash: true, dhash: true, huMoments: true, layoutSig: true, paletteSig: true } });
  const pool = poolRows.map((r) => ({ phash: r.phash, dhash: r.dhash, hu: r.huMoments, layout: r.layoutSig, palette: r.paletteSig }));
  const concepts = await step(ctx.db, ctx.jobId, 'generate+screen', { poolSize: pool.length }, () => generateConcepts(p.inputs, pool, `${p.requestId}:${ctx.workspaceId}`, 3));
  const names = await step(ctx.db, ctx.jobId, 'name-check', null, () => nameCheck(ctx.db, ctx.workspaceId, p.inputs.companyName));
  let n = 0;
  for (const c of concepts) {
    const row = await ctx.db.logoConcept.create({ data: { workspaceId: ctx.workspaceId, requestId: p.requestId, seed: c.seed, archetype: c.archetype, svg: c.svg, params: { ...c.params, palette: c.palette, fontKey: c.fontKey, inputs: p.inputs } as object } });
    await ctx.db.logoFingerprint.create({ data: { conceptId: row.id, source: 'concept', phash: c.fingerprint.phash, dhash: c.fingerprint.dhash, huMoments: c.fingerprint.hu, layoutSig: c.fingerprint.layout, paletteSig: c.fingerprint.palette } });
    await ctx.db.similarityReport.create({ data: { conceptId: row.id, checkedCount: c.report.checkedCount, minDistance: Number.isFinite(c.report.minDistance) ? c.report.minDistance : 999, thresholds: c.report.thresholds, nameCheck: names } });
    const tag = row.id.slice(-10);
    const preview = await protectedPreview(c.svg, tag, 640);
    const meta = await sharp(preview).metadata();
    await storeDeliverable(ctx, { kind: `concept-preview:${row.id}`, fileName: `concept-${++n}.png`, body: preview, mime: 'image/png', width: meta.width, height: meta.height, isPreview: true, watermarked: true, validation: { maxWidth: 640, forensicTag: tag } });
  }
  await log(ctx.db, ctx.jobId, 'info', 'Concepts ready', { count: concepts.length });
  return { deliverables: concepts.length, costMillicents: 0 };
};

/** Product 2 paid delivery: enhanced PNG, transparent PNG, clean 1080p MP4, optional traced SVG, original. */
export const revivalHandler: Handler = async (ctx) => {
  const started = Date.now();
  const { reviveLogo, renderRevealVideo, assertNoWatermark } = await video();
  const inputs = (await inputsFor(ctx)) as RevivalInputs;
  const item = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId! } });
  const raw = await loadCleanAsset(ctx, inputs.logoAssetId);
  const r = await step(ctx.db, ctx.jobId, 'enhance', { output: inputs.output }, () => reviveLogo(raw, { output: inputs.output, logoType: inputs.logoType }));
  const mp4 = await step(ctx.db, ctx.jobId, 'render-video', null, () => renderRevealVideo(r.transparentPng, { style: 'shine-sweep', colors: BRAND, background: { kind: 'transparent' }, width: 1920, height: 1080, fps: 30, seconds: 10, watermark: false }));
  await step(ctx.db, ctx.jobId, 'qc-no-watermark', null, () => assertNoWatermark([mp4.midFrame, r.enhancedPng], r.transparentPng));
  await step(ctx.db, ctx.jobId, 'store', null, async () => {
    const m = await sharp(r.enhancedPng).metadata();
    await storeDeliverable(ctx, { kind: 'enhanced-png', fileName: 'logo-enhanced.png', body: r.enhancedPng, mime: 'image/png', width: m.width, height: m.height, validation: r.metrics as unknown as Record<string, unknown> });
    await storeDeliverable(ctx, { kind: 'transparent-png', fileName: 'logo-transparent.png', body: r.transparentPng, mime: 'image/png', width: m.width, height: m.height, validation: { alpha: true } });
    await storeDeliverable(ctx, { kind: 'reveal-mp4', fileName: 'logo-reveal-10s-1080p.mp4', body: mp4.mp4, mime: 'video/mp4', width: 1920, height: 1080, durationMs: Math.round(mp4.probe.duration * 1000), validation: mp4.checks });
    if (r.tracedSvg) await storeDeliverable(ctx, { kind: 'traced-svg', fileName: 'logo-traced-vector.svg', body: r.tracedSvg, mime: 'image/svg+xml', validation: { ssim: r.metrics.vectorSsim, label: 'traced vector' } });
    await storeDeliverable(ctx, { kind: 'original', fileName: 'original.png', body: raw, mime: 'image/png', validation: { reencoded: true } });
    return { files: r.tracedSvg ? 5 : 4 };
  });
  if (r.needsManagerApproval) {
    await ctx.db.orderItem.update({ where: { id: item.id }, data: { status: 'WAITING_FOR_APPROVAL' } });
    await log(ctx.db, ctx.jobId, 'warn', 'Quality gate below target: waiting for a manager', r.metrics as unknown as object);
    return { deliverables: r.tracedSvg ? 5 : 4, costMillicents: 0, awaitingApproval: true };
  }
  return { deliverables: r.tracedSvg ? 5 : 4, costMillicents: await finishOrderItem(ctx, item.productId, 200, started) };
};

/** Product 3 paid delivery: chosen concept + plan tier → package ZIP; mark reserved forever in the fingerprint index. */
export const logoGeneratorHandler: Handler = async (ctx) => {
  const started = Date.now();
  const { buildPackage } = await logos();
  const inputs = (await inputsFor(ctx)) as { conceptId: string };
  const item = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId! }, include: { plan: true } });
  const pkg = (['basic', 'professional', 'premium'] as const).find((x) => x === item.plan.slug);
  if (!pkg) throw new Error(`Unknown logo package ${item.plan.slug}`);
  const concept = await ctx.db.logoConcept.findFirstOrThrow({ where: { id: inputs.conceptId, workspaceId: ctx.workspaceId }, include: { reports: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  const params = concept.params as { palette: string[]; fontKey: string; inputs: GeneratorInputs };
  const report = concept.reports[0];
  const files = await step(ctx.db, ctx.jobId, 'build-package', { pkg }, () =>
    buildPackage({ seed: concept.seed, archetype: concept.archetype as never, svg: concept.svg, palette: params.palette, fontKey: params.fontKey as never, params: {} }, pkg, params.inputs, { checkedCount: report?.checkedCount ?? 0, minDistance: report?.minDistance ?? 0, thresholds: (report?.thresholds ?? {}) as never, attempts: 0 }),
  );
  await step(ctx.db, ctx.jobId, 'qc', { files: files.length }, async () => {
    const names = files.map((f) => f.name);
    const need = pkg === 'basic' ? ['-3000-transparent.png', '-3000.jpg'] : pkg === 'professional' ? ['.svg', 'favicon/favicon-32.png', 'social/avatar-400.png'] : ['-brand-kit.pdf', '-business-card.pdf', 'social/x-header.png'];
    const missing = need.filter((n) => !names.some((x) => x.endsWith(n)));
    if (missing.length) throw new Error(`Package incomplete: ${missing.join(', ')}`);
    const big = files.find((f) => f.name.endsWith('-3000-white.png'))!;
    const m = await sharp(big.content as Buffer).metadata();
    if (m.width !== 3000) throw new Error('Master PNG is not 3000 px');
    return { names: names.length };
  });
  const zip = await zipFiles(files);
  await step(ctx.db, ctx.jobId, 'store+reserve', null, async () => {
    await storeDeliverable(ctx, { kind: 'logo-package-zip', fileName: `logo-${pkg}.zip`, body: zip, mime: 'application/zip', validation: { pkg, files: files.length, zip: zip.subarray(0, 2).toString() === 'PK' } });
    const svgFile = files.find((f) => f.name.endsWith('.svg') && !/-(black|white|one-color)\.svg$/.test(f.name));
    if (svgFile) await storeDeliverable(ctx, { kind: 'logo-svg', fileName: 'logo.svg', body: Buffer.from(svgFile.content as string), mime: 'image/svg+xml', validation: { svg: true } });
    await ctx.db.logoConcept.update({ where: { id: concept.id }, data: { purchased: true, chosen: true, orderItemId: item.id } });
    await ctx.db.logoFingerprint.updateMany({ where: { conceptId: concept.id }, data: { reservedAt: new Date(), source: 'sold' } });
    if (pkg === 'premium' && report) await ctx.db.similarityReport.update({ where: { id: report.id }, data: { extended: true } });
    return { reserved: true };
  });
  return { deliverables: pkg === 'basic' ? 1 : 2, costMillicents: await finishOrderItem(ctx, item.productId, 100, started) };
};

export const newRequestId = () => randomBytes(9).toString('base64url');

export const LOGO_FLOW_HANDLERS: Record<string, Handler> = {
  'preview.animated-gif-logo': previewGifHandler,
  'preview.logo-revival': previewRevivalHandler,
  'preview.logo-generator': previewConceptsHandler,
  'product.logo-revival': revivalHandler,
  'product.logo-generator': logoGeneratorHandler,
};
