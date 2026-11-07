import { createHash } from 'node:crypto';
import type { PrismaClient } from '@roi/database';
import { scanUpload } from './scan';
import type { StorageProvider } from './storage';

/**
 * Upload intake for Products 1–2. Kept free of canvas/FFmpeg imports so the web app can run it in a request handler
 * (only sharp is loaded, lazily, through the video engine's image module).
 */
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export class IntakeRejected extends Error {}

/** Spec §6 + Product 1 step 1: size cap, magic bytes, pixel cap, malware scan, re-encode to PNG, metadata stripped. */
export async function ingestLogoUpload(db: PrismaClient, storage: StorageProvider, a: { workspaceId: string; buf: Buffer; originalName?: string; purpose: 'animated-gif-logo' | 'logo-revival' | 'email-signature-suite'; minSide: number }) {
  const { validateLogo, UploadRejected } = await import('../../video-engine/src/image');
  const scan = await scanUpload(a.buf).catch((e: Error) => {
    throw new IntakeRejected(`Security scan unavailable, please try again shortly (${e.message.slice(0, 60)}).`);
  });
  const hash = sha256(a.buf);
  if (!scan.clean) {
    await db.customerAsset.create({ data: { workspaceId: a.workspaceId, kind: 'logo-upload', storageKey: `rejected/${a.workspaceId}/${hash}`, mime: 'application/octet-stream', sizeBytes: a.buf.length, sha256: hash, originalName: a.originalName?.slice(0, 200), scanStatus: 'INFECTED' } });
    throw new IntakeRejected('The file failed the security scan and was discarded.');
  }
  let v: Awaited<ReturnType<typeof validateLogo>>;
  try {
    v = await validateLogo(a.buf, { minSide: a.minSide });
  } catch (e) {
    if (e instanceof UploadRejected) throw new IntakeRejected(e.message);
    throw e;
  }
  const key = `${a.workspaceId}/uploads/${sha256(v.png).slice(0, 24)}.png`;
  const existing = await db.customerAsset.findUnique({ where: { storageKey: key } });
  const asset =
    existing ??
    (await (async () => {
      const stored = await storage.put('private', key, v.png, 'image/png');
      return db.customerAsset.create({ data: { workspaceId: a.workspaceId, kind: 'logo-upload', storageKey: key, mime: 'image/png', sizeBytes: v.png.length, sha256: stored.sha256, width: v.width, height: v.height, originalName: a.originalName?.slice(0, 200), scanStatus: 'CLEAN' } });
    })());
  const upload = await db.logoUpload.create({ data: { workspaceId: a.workspaceId, assetId: asset.id, purpose: a.purpose, analysis: { scanEngine: scan.engine, sourceKind: v.kind, width: v.width, height: v.height } } });
  return { asset, upload, scanEngine: scan.engine };
}

/** Cache key for previews: same logo + same options → same preview (spec Product 1 step 3). */
export const previewInputHash = (product: string, assetSha: string, options: object) => sha256(`${product}:${assetSha}:${JSON.stringify(options, Object.keys(options).sort())}`);

