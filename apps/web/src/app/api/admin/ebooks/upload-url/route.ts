import { randomUUID } from 'node:crypto';
import { presignUrl, r2FromEnv } from '@roi/integrations/r2';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { getSession } from '@/server/session';
import { can } from '@/server/authz';
import { rateLimit } from '@/server/rate-limit';

const MAX = 200 * 1024 * 1024;

/**
 * Direct-to-storage upload for e-book source files (spec Product 4): the browser PUTs the PDF straight to the private
 * R2 bucket with a 15-minute presigned URL, so large books never pass through the web server. In development (local
 * storage) a staff-only local endpoint is returned instead.
 */
export async function POST(req: Request) {
  try {
    await assertCsrf(req.headers.get('x-csrf-token'));
  } catch (e) {
    if (e instanceof CsrfError) return Response.json({ error: 'Session expired. Refresh and try again.' }, { status: 403 });
    throw e;
  }
  const s = await getSession();
  if (!s || !(await can(s.user, 'ebooks.manage')) || !s.session.twoFactorVerifiedAt) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { size?: number; type?: string };
  if (body.type !== 'application/pdf') return Response.json({ error: 'Upload a PDF file.' }, { status: 400 });
  if (!body.size || body.size > MAX) return Response.json({ error: 'The PDF must be smaller than 200 MB.' }, { status: 413 });
  const rl = await rateLimit(`ebook-upload:${s.user.id}`, 30, 3600);
  if (!rl.ok) return Response.json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
  const key = `ebooks/source/${randomUUID()}.pdf`;
  const cfg = r2FromEnv();
  if (cfg && process.env.R2_BUCKET_PRIVATE) return Response.json({ key, method: 'PUT', url: presignUrl(cfg, 'PUT', process.env.R2_BUCKET_PRIVATE, key, 900) });
  if (process.env.APP_ENV !== 'production' && process.env.LOCAL_STORAGE_DIR) return Response.json({ key, method: 'PUT', url: `/api/admin/ebooks/upload-local?key=${encodeURIComponent(key)}` });
  return Response.json({ error: 'File storage is awaiting configuration (connect Cloudflare R2).' }, { status: 503 });
}
