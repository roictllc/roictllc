import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@roi/shared-utils';
import { storageFromEnv } from '@roi/product-engine/storage';
import { db } from './db';
import { getFlag, getSetting } from './catalog';

/**
 * Pre-payment previews (spec §10, Products 1–3): cheap, rate-limited, verified email required, watermarked,
 * served only through short-lived signed URLs to the owning workspace with `Cache-Control: no-store`.
 */
export const CREATE_PRODUCTS = ['animated-gif-logo', 'logo-revival', 'logo-generator'] as const;
export type CreateSlug = (typeof CREATE_PRODUCTS)[number];
export const isCreateSlug = (s: string): s is CreateSlug => (CREATE_PRODUCTS as readonly string[]).includes(s);

/** Daily free previews per verified account (P2's 3/day is from the spec; the others are admin settings). */
export async function dailyPreviewLimit(slug: CreateSlug) {
  const v = await getSetting<{ gif?: number; revival?: number; logo?: number }>('previews.dailyLimit', {});
  return slug === 'animated-gif-logo' ? (v.gif ?? 10) : slug === 'logo-revival' ? (v.revival ?? 3) : (v.logo ?? 5);
}

/**
 * Previews are open when the product is LIVE, or before launch when the `previews` flag is LIVE (lets the owner and
 * early customers try the engines while checkout is still closed). Storage must be configured either way.
 */
export async function previewAvailability(slug: CreateSlug): Promise<{ ok: true } | { ok: false; reason: string }> {
  const product = await db().product.findUnique({ where: { slug }, select: { visibility: true } });
  if (!product || product.visibility === 'HIDDEN') return { ok: false, reason: 'This product is not available.' };
  if (!storageFromEnv()) return { ok: false, reason: 'Free previews open as soon as file storage is connected.' };
  if (product.visibility !== 'LIVE' && (await getFlag('previews')) !== 'LIVE') return { ok: false, reason: 'Free previews open at launch. Create your account now and we will email you.' };
  return { ok: true };
}

/** Product 8 works without the worker for previews; uploads still need storage. */
export async function signatureAvailability(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const product = await db().product.findUnique({ where: { slug: 'email-signature-suite' }, select: { visibility: true } });
  if (!product || product.visibility === 'HIDDEN') return { ok: false, reason: 'This product is not available.' };
  if (product.visibility !== 'LIVE' && (await getFlag('previews')) !== 'LIVE') return { ok: false, reason: 'Signature previews open at launch.' };
  return { ok: true };
}

export async function workerOnline() {
  const beat = await db().workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } });
  return !!beat && Date.now() - beat.lastBeatAt.getTime() < 120_000;
}

const secret = () => process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-0123456789';

export function previewUrl(deliverableId: string, workspaceId: string, ttlS = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const sig = createHmac('sha256', secret()).update(`${deliverableId}.${workspaceId}.${exp}`).digest('base64url');
  return `/api/previews/${deliverableId}?e=${exp}&s=${sig}`;
}

export function verifyPreviewSig(deliverableId: string, workspaceId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = createHmac('sha256', secret()).update(`${deliverableId}.${workspaceId}.${exp}`).digest('base64url');
  return safeEqual(want, sig);
}

/** The preview job for a render/request (one job per render; retried by the user creating a new one). */
export async function previewJob(key: string) {
  const job = await db().automationJob.findUnique({ where: { idempotencyKey: key }, include: { steps: { orderBy: { startedAt: 'asc' }, select: { name: true, status: true } } } });
  return job;
}
