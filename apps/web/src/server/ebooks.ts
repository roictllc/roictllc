import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from '@roi/shared-utils';

/**
 * E-book sample pages (spec Product 4): page images only (no text layer, no PDF), served through short-lived signed
 * URLs minted when the book page renders. Only rows in ebook_preview_pages can ever be served.
 */
const secret = () => process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-0123456789';

export function ebookPageUrl(pageId: string, ttlS = 900) {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const sig = createHmac('sha256', secret()).update(`ebook-page:${pageId}:${exp}`).digest('base64url');
  return `/api/ebooks/page/${pageId}?e=${exp}&s=${sig}`;
}

export function verifyEbookPageSig(pageId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(createHmac('sha256', secret()).update(`ebook-page:${pageId}:${exp}`).digest('base64url'), sig);
}

export const slugifyTitle = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'book';
