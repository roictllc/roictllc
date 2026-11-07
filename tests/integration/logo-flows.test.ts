import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import {
  autoRefundHandler, builtinScan, enqueue, IntakeRejected, ingestLogoUpload, localStorage, logoGeneratorHandler, notifyFailed,
  previewConceptsHandler, previewGifHandler, previewRevivalHandler, revivalHandler, type HandlerContext,
} from '@roi/product-engine';
import { pinkWatermarkRatio } from '../../packages/video-engine/src/index';
import { readForensicTag } from '../../packages/logo-engine/src/index';
import { makeCustomer, planFor } from './helpers';

/** Jobs here are run by calling handlers directly; scheduling them far ahead keeps other tests' claim() calls away. */
const FUTURE = new Date(Date.now() + 365 * 86_400_000);

/**
 * Products 1–3 end to end on real files (spec §11-9): intake + scan, watermarked previews, paid delivery without
 * watermark, uniqueness bookkeeping, failure → refund scheduling.
 */
const storage = localStorage(mkdtempSync(path.join(tmpdir(), 'roi-flows-')));

const logoSvg = (w: number, h: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <circle cx="${w * 0.25}" cy="${h / 2}" r="${h * 0.32}" fill="#0B5FFF"/><rect x="${w * 0.45}" y="${h * 0.3}" width="${w * 0.45}" height="${h * 0.14}" rx="8" fill="#111827"/>
  <rect x="${w * 0.45}" y="${h * 0.52}" width="${w * 0.3}" height="${h * 0.1}" rx="6" fill="#16A34A"/></svg>`);
const pngLogo = () => sharp(logoSvg(600, 400)).png().toBuffer();
const tinyJpeg = () => sharp(logoSvg(96, 64)).flatten({ background: '#ffffff' }).jpeg({ quality: 60 }).toBuffer();

async function ctxFor(workspaceId: string, type: string, payload: Record<string, unknown>, orderItemId: string | null = null): Promise<HandlerContext> {
  const job = await enqueue(db(), { type, payload, idempotencyKey: `${type}:${Math.random()}`, workspaceId, orderItemId, lane: orderItemId ? 'paid' : 'preview', runAt: FUTURE });
  return { db: db(), storage, jobId: job.id, workspaceId, orderItemId, payload, computeRateMillicentsPerS: 1 };
}

async function paidOrder(workspaceId: string, userId: string, productSlug: string, planSlug: string | undefined, inputs: object) {
  const { product, plan, price } = await planFor(productSlug, planSlug);
  return db().order.create({
    data: {
      orderNumber: `T-${Math.random().toString(36).slice(2, 9)}`, workspaceId, userId, status: 'PROCESSING', paidAt: new Date(), subtotalCents: price.amountCents, totalCents: price.amountCents,
      items: { create: { productId: product.id, planId: plan.id, priceId: price.id, unitAmountCents: price.amountCents, status: 'PROCESSING', idempotencyKey: `oi_${Math.random()}`, input: { create: { formVersion: 1, data: inputs } } } },
    },
    include: { items: true },
  });
}

describe('upload intake (spec §6, Product 1 step 1)', () => {
  it('builtin scan catches EICAR, script payloads and ZIP polyglots; clean images pass', async () => {
    const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    expect(builtinScan(eicar)).toMatchObject({ clean: false, signature: 'Eicar-Test-Signature' });
    const png = await pngLogo();
    expect(builtinScan(Buffer.concat([png, Buffer.from('<script>alert(1)</script>')])).clean).toBe(false);
    const zipTail = Buffer.concat([png, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0])]);
    expect(builtinScan(zipTail)).toMatchObject({ clean: false, signature: 'Polyglot.ZIP' });
    expect(builtinScan(png).clean).toBe(true);
  });

  it('rejects infected and undersized files, re-encodes and stores clean ones (deduplicated)', async () => {
    const { ws } = await makeCustomer('intake');
    const png = await pngLogo();
    await expect(ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: Buffer.concat([png, Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]), purpose: 'animated-gif-logo', minSide: 300 })).rejects.toBeInstanceOf(IntakeRejected);
    expect(await db().customerAsset.count({ where: { workspaceId: ws.id, scanStatus: 'INFECTED' } })).toBe(1);
    await expect(ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: await tinyJpeg(), purpose: 'animated-gif-logo', minSide: 300 })).rejects.toThrow(/at least 300 px/);
    const withExif = await sharp(png).withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } }).png().toBuffer();
    const a = await ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: withExif, originalName: 'logo.png', purpose: 'animated-gif-logo', minSide: 300 });
    expect(a.asset.scanStatus).toBe('CLEAN');
    const stored = await storage.get('private', a.asset.storageKey);
    expect(stored.includes(Buffer.from('secret-gps'))).toBe(false);
    const again = await ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: withExif, purpose: 'animated-gif-logo', minSide: 300 });
    expect(again.asset.id).toBe(a.asset.id);
  });
});

describe('Product 1 preview', () => {
  it('renders a ≤480 px watermarked GIF preview and links it to the render', async () => {
    const { ws } = await makeCustomer('gifprev');
    const { asset, upload } = await ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: await pngLogo(), purpose: 'animated-gif-logo', minSide: 300 });
    const inputs = { logoAssetId: asset.id, style: 'shine-sweep', background: 'transparent', loopSpeed: 'normal', effectColors: ['#00E5FF', '#7B3FFF'] };
    const render = await db().logoRender.create({ data: { uploadId: upload.id, style: 'shine-sweep', isPreview: true, inputHash: 'h1', params: { inputs } } });
    await previewGifHandler(await ctxFor(ws.id, 'preview.animated-gif-logo', { renderId: render.id, inputs }));
    const r = await db().logoRender.findUniqueOrThrow({ where: { id: render.id } });
    const d = await db().generatedDeliverable.findUniqueOrThrow({ where: { id: r.deliverableId! } });
    expect(d).toMatchObject({ isPreview: true, watermarked: true, mime: 'image/gif' });
    const gif = await storage.get('private', d.storageKey);
    const meta = await sharp(gif, { pages: -1 }).metadata();
    expect(meta.width).toBeLessThanOrEqual(480);
    expect(meta.pages).toBeGreaterThan(10);
    expect(await pinkWatermarkRatio(await sharp(gif, { pages: 1 }).png().toBuffer())).toBeGreaterThan(0.01);
  });
});

describe('Product 3 concepts → paid package', () => {
  it('creates 3 screened concepts with protected previews, then delivers a clean Professional package and reserves the mark', async () => {
    const { ws, user } = await makeCustomer('logogen');
    const inputs = { companyName: 'Harbor Light Dental', category: 'dentist', colors: ['#0B5FFF', '#16A34A'], style: 'modern' as const };
    const requestId = `req${Date.now()}`;
    const pctx = await ctxFor(ws.id, 'preview.logo-generator', { requestId, inputs });
    await previewConceptsHandler(pctx);
    const concepts = await db().logoConcept.findMany({ where: { requestId }, include: { fingerprint: true, reports: true } });
    expect(concepts).toHaveLength(3);
    expect(new Set(concepts.map((c) => c.archetype)).size).toBe(3);
    for (const c of concepts) {
      expect(c.fingerprint).toBeTruthy();
      expect(c.reports[0].nameCheck).toMatchObject({ result: 'none found in checked sources' });
      const pv = await db().generatedDeliverable.findFirstOrThrow({ where: { jobId: pctx.jobId, kind: `concept-preview:${c.id}` } });
      expect(pv).toMatchObject({ isPreview: true, watermarked: true });
      const png = await storage.get('private', pv.storageKey);
      expect((await sharp(png).metadata()).width).toBeLessThanOrEqual(640);
      expect(await readForensicTag(png)).toBe(c.id.slice(-10));
    }
    const chosen = concepts[1];
    const order = await paidOrder(ws.id, user.id, 'logo-generator', 'professional', { conceptId: chosen.id });
    const item = order.items[0];
    await logoGeneratorHandler(await ctxFor(ws.id, 'product.logo-generator', { orderItemId: item.id }, item.id));
    const files = await db().generatedDeliverable.findMany({ where: { orderItemId: item.id } });
    expect(files.map((f) => f.kind).sort()).toEqual(['logo-package-zip', 'logo-svg']);
    expect(files.every((f) => !f.isPreview && !f.watermarked)).toBe(true);
    const zip = await storage.get('private', files.find((f) => f.kind === 'logo-package-zip')!.storageKey);
    const dir = mkdtempSync(path.join(tmpdir(), 'roi-zip-'));
    const zipPath = path.join(dir, 'p.zip');
    await import('node:fs/promises').then((fs) => fs.writeFile(zipPath, zip));
    const listing = execFileSync('unzip', ['-Z1', zipPath]).toString();
    for (const n of ['harbor-light-dental.svg', 'harbor-light-dental-3000-white.png', 'favicon/favicon-32.png', 'social/avatar-400.png', 'LICENSE.txt']) expect(listing).toContain(n);
    expect(listing).not.toContain('brand-kit.pdf'); // Premium only
    execFileSync('unzip', ['-o', '-q', zipPath, 'harbor-light-dental-3000-white.png', '-d', dir]);
    const master = await import('node:fs/promises').then((fs) => fs.readFile(path.join(dir, 'harbor-light-dental-3000-white.png')));
    expect((await sharp(master).metadata()).width).toBe(3000);
    expect(await pinkWatermarkRatio(master)).toBeLessThan(0.005);
    const fp = await db().logoFingerprint.findUniqueOrThrow({ where: { conceptId: chosen.id } });
    expect(fp.reservedAt).toBeTruthy();
    expect(fp.source).toBe('sold');
    expect((await db().logoConcept.findUniqueOrThrow({ where: { id: chosen.id } })).purchased).toBe(true);
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('COMPLETED');
  });
});

describe('Product 2 preview → paid delivery', () => {
  it('previews a 10 s 540p watermarked video, then delivers clean 4× files and a 1080p video', async () => {
    const { ws, user } = await makeCustomer('revival');
    const { asset, upload } = await ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: await tinyJpeg(), purpose: 'logo-revival', minSide: 64 });
    const inputs = { logoAssetId: asset.id, output: 'transparent', logoType: 'flat' };
    const render = await db().logoRender.create({ data: { uploadId: upload.id, style: 'transparent', isPreview: true, inputHash: 'rv1', params: { inputs } } });
    await previewRevivalHandler(await ctxFor(ws.id, 'preview.logo-revival', { renderId: render.id, inputs }));
    const r = await db().logoRender.findUniqueOrThrow({ where: { id: render.id } });
    const prev = await db().generatedDeliverable.findUniqueOrThrow({ where: { id: r.deliverableId! } });
    expect(prev).toMatchObject({ isPreview: true, watermarked: true, mime: 'video/mp4', width: 960, height: 540 });
    expect(Math.abs(prev.durationMs! - 10_000)).toBeLessThanOrEqual(100);
    expect((r.params as { metrics: { improvement: number } }).metrics.improvement).toBeGreaterThan(1);

    const order = await paidOrder(ws.id, user.id, 'logo-revival', undefined, inputs);
    const item = order.items[0];
    const res = await revivalHandler(await ctxFor(ws.id, 'product.logo-revival', { orderItemId: item.id }, item.id));
    const files = await db().generatedDeliverable.findMany({ where: { orderItemId: item.id } });
    const kinds = files.map((f) => f.kind);
    for (const k of ['enhanced-png', 'transparent-png', 'reveal-mp4', 'original']) expect(kinds).toContain(k);
    const video = files.find((f) => f.kind === 'reveal-mp4')!;
    expect(video).toMatchObject({ width: 1920, height: 1080, watermarked: false, isPreview: false });
    expect(Math.abs(video.durationMs! - 10_000)).toBeLessThanOrEqual(100);
    const enhanced = files.find((f) => f.kind === 'enhanced-png')!;
    expect(enhanced.width! * enhanced.height!).toBeGreaterThanOrEqual(96 * 64 * 16);
    const status = (await db().orderItem.findUniqueOrThrow({ where: { id: item.id } })).status;
    expect(res.awaitingApproval ? 'WAITING_FOR_APPROVAL' : 'COMPLETED').toBe(status);
  });
});

describe('failure rules (spec Product 1/2)', () => {
  it('dead-lettered paid job → item FAILED, customer + staff notified, auto-refund scheduled in 24 h; refund refuses without Stripe and skips resolved items', async () => {
    const { ws, user } = await makeCustomer('fail');
    const order = await paidOrder(ws.id, user.id, 'animated-gif-logo', undefined, { logoAssetId: 'missing-asset-0000' });
    const item = order.items[0];
    await notifyFailed(db(), item.id, 'QC failed: revealDurationOk');
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('FAILED');
    const refundJob = await db().automationJob.findUniqueOrThrow({ where: { idempotencyKey: `${item.id}:auto-refund` } });
    expect(refundJob.runAt.getTime()).toBeGreaterThan(Date.now() + 23.9 * 3600_000);
    expect(await db().notificationLog.count({ where: { to: user.email, template: 'failure-notice' } })).toBe(1);
    expect(await db().notification.count({ where: { userId: user.id } })).toBe(1);
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    await expect(autoRefundHandler(await ctxFor(ws.id, 'housekeeping.auto-refund', { orderItemId: item.id }, item.id))).rejects.toThrow(/AWAITING_CONFIGURATION/);
    await db().orderItem.update({ where: { id: item.id }, data: { status: 'COMPLETED' } });
    await expect(autoRefundHandler(await ctxFor(ws.id, 'housekeeping.auto-refund', { orderItemId: item.id }, item.id))).resolves.toMatchObject({ deliverables: 0 });
    if (saved) process.env.STRIPE_SECRET_KEY = saved;
  });
});
