import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@roi/shared-utils';

/**
 * Signed drafts: validated form data is sent back to the browser as an HMAC-signed token so the buy step can trust it
 * without a draft table. The signature binds the workspace and expires after 24 h; anything edited client-side fails.
 */
const secret = () => process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-0123456789';

export function signDraft(data: unknown, workspaceId: string, ttlS = 86_400) {
  const body = Buffer.from(JSON.stringify({ d: data, w: workspaceId, e: Math.floor(Date.now() / 1000) + ttlS })).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(`draft:${body}`).digest('base64url')}`;
}

export function verifyDraft<T>(token: string, workspaceId: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(createHmac('sha256', secret()).update(`draft:${body}`).digest('base64url'), sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { d: T; w: string; e: number };
    if (p.w !== workspaceId || p.e < Date.now() / 1000) return null;
    return p.d;
  } catch {
    return null;
  }
}
