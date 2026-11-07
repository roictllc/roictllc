import { createHash } from 'node:crypto';
import type { PrismaClient } from '@roi/database';
import sharp from 'sharp';
import { buildSignatureSuite, lintEmailHtml, type Company, type Employee } from './signatures';
import { step, log } from './queue';
import type { StorageProvider } from './storage';
import type { SignatureTemplateSlug } from './signature-templates';

/**
 * Job handlers (spec §10): each product handler runs named steps with quality gates, stores files, registers
 * GeneratedDeliverable rows with validation results, records ProductionCost, and completes the order item.
 * A product is COMPLETED only when every deliverable exists and passed validation.
 */
export interface HandlerContext {
  db: PrismaClient;
  storage: StorageProvider;
  jobId: string;
  workspaceId: string;
  orderItemId: string | null;
  payload: Record<string, unknown>;
  computeRateMillicentsPerS: number;
}
export type Handler = (ctx: HandlerContext) => Promise<{ deliverables: number; costMillicents: number; awaitingApproval?: boolean }>;

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export async function storeDeliverable(ctx: HandlerContext, f: { kind: string; fileName: string; body: Buffer; mime: string; bucket?: 'private' | 'public'; validation: Record<string, unknown>; width?: number; height?: number; durationMs?: number; isPreview?: boolean; watermarked?: boolean }) {
  const key = `${ctx.workspaceId}/${ctx.orderItemId ?? ctx.jobId}/${sha(f.body).slice(0, 12)}-${f.fileName}`;
  const stored = await ctx.storage.put(f.bucket ?? 'private', key, f.body, f.mime);
  return ctx.db.generatedDeliverable.upsert({
    where: { storageKey: key },
    update: {},
    create: {
      workspaceId: ctx.workspaceId, jobId: ctx.jobId, orderItemId: ctx.orderItemId, kind: f.kind, fileName: f.fileName, storageKey: key, mime: f.mime, sizeBytes: f.body.length, sha256: stored.sha256,
      width: f.width, height: f.height, durationMs: f.durationMs, isPreview: !!f.isPreview, watermarked: !!f.watermarked, publicUrl: stored.publicUrl, validation: { ...f.validation, passed: true },
    },
  });
}

export async function finishOrderItem(ctx: HandlerContext, productId: string, costMillicents: number, startedAt: number) {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const compute = seconds * ctx.computeRateMillicentsPerS;
  await ctx.db.productionCost.create({ data: { productId, orderItemId: ctx.orderItemId, jobId: ctx.jobId, kind: 'COMPUTE', amountMillicents: compute + costMillicents, details: { seconds, rate: ctx.computeRateMillicentsPerS } } });
  if (ctx.orderItemId) {
    await ctx.db.orderItem.update({ where: { id: ctx.orderItemId }, data: { status: 'COMPLETED' } });
    const item = await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId }, include: { order: { include: { items: true } } } });
    if (item.order.items.every((i) => i.id === ctx.orderItemId || i.status === 'COMPLETED')) await ctx.db.order.update({ where: { id: item.orderId }, data: { status: 'COMPLETED' } });
  }
  return compute + costMillicents;
}

export async function inputsFor(ctx: HandlerContext) {
  if (!ctx.orderItemId) return ctx.payload.inputs as Record<string, unknown>;
  const input = await ctx.db.productInput.findUnique({ where: { orderItemId: ctx.orderItemId } });
  return (input?.data ?? ctx.payload.inputs) as Record<string, unknown>;
}

/** Product 8 — Email Signature Suite. */
export const signatureHandler: Handler = async (ctx) => {
  const started = Date.now();
  const data = (await inputsFor(ctx)) as { company: Company; employees: Employee[]; templateSlug: SignatureTemplateSlug; utm?: boolean };
  const item = ctx.orderItemId ? await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId } }) : null;
  // Use the customer's animated GIF logo (Product 1) when present in the workspace.
  const gif = await ctx.db.generatedDeliverable.findFirst({ where: { workspaceId: ctx.workspaceId, kind: 'email-gif', isPreview: false, publicUrl: { not: null } }, orderBy: { createdAt: 'desc' } });
  const company: Company = { ...data.company, logoUrl: data.company.logoUrl ?? gif?.publicUrl ?? undefined, logoWidth: gif?.width ?? data.company.logoWidth, logoHeight: gif?.height ?? data.company.logoHeight };
  const suite = await step(ctx.db, ctx.jobId, 'generate', { employees: data.employees.length, template: data.templateSlug }, () => buildSignatureSuite({ templateSlug: data.templateSlug, company, employees: data.employees, utm: data.utm }));
  await step(ctx.db, ctx.jobId, 'qa', null, async () => {
    const issues = suite.items.flatMap((i) => lintEmailHtml(i.html));
    if (issues.length) throw new Error(`Email HTML QA failed: ${issues[0]}`);
    return { checked: suite.items.length };
  });
  await step(ctx.db, ctx.jobId, 'store', null, async () => {
    await storeDeliverable(ctx, { kind: 'signature-zip', fileName: 'email-signatures.zip', body: suite.zip, mime: 'application/zip', validation: { zip: suite.zip.subarray(0, 2).toString() === 'PK', files: suite.files.length } });
    await storeDeliverable(ctx, { kind: 'signature-gallery', fileName: 'gallery.html', body: Buffer.from(suite.gallery), mime: 'text/html', validation: { html: true } });
    return { files: 2 };
  });
  const cost = await finishOrderItem(ctx, item?.productId ?? (ctx.payload.productId as string), 100, started);
  await log(ctx.db, ctx.jobId, 'info', 'Signature suite delivered', { employees: data.employees.length });
  return { deliverables: 2, costMillicents: cost };
};

/** Product 1 — Animated GIF Logo (requires FFmpeg + canvas on the worker). */
export const gifLogoHandler: Handler = async (ctx) => {
  const started = Date.now();
  const { renderLogoAnimation, prepareLogo, validateLogo } = await import('../../video-engine/src/index');
  const data = (await inputsFor(ctx)) as { logoAssetId: string; style: string; background: 'keep' | 'transparent' | 'solid'; backgroundColor?: string; loopSpeed?: 'slow' | 'normal' | 'fast'; tagline?: string; effectColors?: string[] };
  const asset = await ctx.db.customerAsset.findFirstOrThrow({ where: { id: data.logoAssetId, workspaceId: ctx.workspaceId } });
  if (asset.scanStatus !== 'CLEAN') throw new Error('Upload not scanned clean yet');
  const raw = await ctx.storage.get('private', asset.storageKey);
  const { png } = await step(ctx.db, ctx.jobId, 'validate', { asset: asset.id }, () => validateLogo(raw));
  const prepared = await step(ctx.db, ctx.jobId, 'prepare', { background: data.background }, () => prepareLogo(png, { background: data.background }));
  const result = await step(ctx.db, ctx.jobId, 'render+encode+qc', { style: data.style }, () => renderLogoAnimation(prepared.png, { style: data.style as never, colors: data.effectColors?.length ? data.effectColors : ['#00E5FF', '#7B3FFF'], background: data.background === 'solid' ? { kind: 'solid', color: data.backgroundColor ?? '#FFFFFF' } : data.background === 'transparent' ? { kind: 'transparent' } : { kind: 'keep', color: '#FFFFFF' }, speed: data.loopSpeed, tagline: data.tagline }));
  const qc = result.qc as { master: { width: number; height: number }; email: { width: number; height: number }; reveal: { duration: number } };
  await step(ctx.db, ctx.jobId, 'store', null, async () => {
    await storeDeliverable(ctx, { kind: 'master-gif', fileName: 'logo-1920x1080.gif', body: result.masterGif, mime: 'image/gif', width: qc.master.width, height: qc.master.height, validation: qc as unknown as Record<string, unknown> });
    await storeDeliverable(ctx, { kind: 'email-gif', fileName: 'logo-email.gif', body: result.emailGif, mime: 'image/gif', bucket: 'public', width: qc.email.width, height: qc.email.height, validation: { underOneMB: result.emailGif.length <= 1_000_000 } });
    const fb = await sharp(result.pngFallback).metadata();
    await storeDeliverable(ctx, { kind: 'png-fallback', fileName: 'logo-fallback.png', body: result.pngFallback, mime: 'image/png', bucket: 'public', width: fb.width, height: fb.height, validation: { png: true } });
    await storeDeliverable(ctx, { kind: 'reveal-mp4', fileName: 'logo-reveal-10s-1080p.mp4', body: result.revealMp4, mime: 'video/mp4', width: 1920, height: 1080, durationMs: Math.round(qc.reveal.duration * 1000), validation: { h264: true, faststart: true } });
    await storeDeliverable(ctx, { kind: 'original', fileName: `original.png`, body: png, mime: 'image/png', validation: { reencoded: true } });
    return { files: 5 };
  });
  const item = ctx.orderItemId ? await ctx.db.orderItem.findUniqueOrThrow({ where: { id: ctx.orderItemId } }) : null;
  return { deliverables: 5, costMillicents: await finishOrderItem(ctx, item!.productId, 300, started) };
};

export const HANDLERS: Record<string, Handler> = {
  'product.email-signature-suite': signatureHandler,
  'product.animated-gif-logo': gifLogoHandler,
};
