import 'server-only';
import { cookies, headers } from 'next/headers';
import { safeEqual } from '@roi/shared-utils';
import { appUrl, isHttps } from './env';

/**
 * CSRF (spec §6): double-submit token (cookie set by proxy.ts, echoed in a hidden form field or X-CSRF-Token header)
 * + strict Origin check on every state-changing request. Server Actions additionally get Next's built-in origin check.
 */
export const CSRF_COOKIE = () => (isHttps() ? '__Host-roi_csrf' : 'roi_csrf');

export async function csrfToken(): Promise<string> {
  const jar = await cookies();
  const h = await headers();
  return jar.get(CSRF_COOKIE())?.value ?? h.get('x-csrf-bootstrap') ?? '';
}

export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const allowed = new Set([new URL(appUrl()).host, ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
    if (host) allowed.add(host);
    return allowed.has(o.host);
  } catch {
    return false;
  }
}

export class CsrfError extends Error {
  constructor() {
    super('CSRF validation failed');
  }
}

export async function assertCsrf(submitted: FormDataEntryValue | string | null | undefined) {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!originAllowed(origin, host)) throw new CsrfError();
  const cookie = (await cookies()).get(CSRF_COOKIE())?.value;
  const value = typeof submitted === 'string' ? submitted : submitted ? String(submitted) : h.get('x-csrf-token') ?? '';
  if (!cookie || !value || !safeEqual(cookie, value)) throw new CsrfError();
}
