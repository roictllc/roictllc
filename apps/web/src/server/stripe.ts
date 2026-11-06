import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal Stripe REST client + webhook signature verification (no SDK; spec §9.2). */
export const STRIPE_API_VERSION = '2025-10-29.clover';

export async function stripeApi<T = Record<string, unknown>>(path: string, body?: Record<string, string>, opts: { method?: string; idempotencyKey?: string } = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': STRIPE_API_VERSION, ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}) },
    body: body ? new URLSearchParams(body) : undefined, signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

/** Verifies `Stripe-Signature` (v1 HMAC-SHA256 over `${t}.${rawBody}`), 5-minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceS = 300, nowS = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]).filter((x) => x.length === 2).map(([k, v]) => [k, v])) as Record<string, string>;
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(nowS - t) > toleranceS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export function signForTest(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}
