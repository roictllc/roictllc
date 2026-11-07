import { storageFromEnv } from '@roi/product-engine/storage';
import { getSession } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';
import { db } from '@/server/db';
import { verifyPreviewSig } from '@/server/previews';

export const runtime = 'nodejs';

/**
 * Watermarked previews only (spec Product 3 "preview protection"): signed URL valid ~10 minutes AND a session that
 * can see the workspace; never cached; served inline. Paid files never come through here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s) return new Response('Unauthorized', { status: 401 });
  const f = await db().generatedDeliverable.findUnique({ where: { id } });
  if (!f || !f.isPreview || !f.watermarked) return new Response('Not found', { status: 404 });
  const ws = await accessibleWorkspaceIds(s.user);
  if (ws !== null && !ws.includes(f.workspaceId)) return new Response('Not found', { status: 404 });
  const u = new URL(req.url);
  if (!verifyPreviewSig(f.id, f.workspaceId, u.searchParams.get('e'), u.searchParams.get('s'))) return new Response('Link expired. Reload the page.', { status: 403 });
  const storage = storageFromEnv();
  if (!storage) return new Response('File storage is awaiting configuration', { status: 503 });
  const body = await storage.get('private', f.storageKey);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': f.mime,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store, private, max-age=0',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
