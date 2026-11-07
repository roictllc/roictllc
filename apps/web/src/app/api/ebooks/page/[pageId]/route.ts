import { storageFromEnv } from '@roi/product-engine/storage';
import { db } from '@/server/db';
import { verifyEbookPageSig } from '@/server/ebooks';
import { getSession } from '@/server/session';

/** Watermarked sample page images only — never the PDF (spec Product 4). Signed, short-lived, not cached. */
export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const u = new URL(req.url);
  if (!verifyEbookPageSig(pageId, u.searchParams.get('e'), u.searchParams.get('s'))) return new Response('Link expired. Reload the page.', { status: 403 });
  const page = await db().eBookPreviewPage.findUnique({ where: { id: pageId }, include: { ebook: { select: { status: true } } } });
  if (!page) return new Response('Not found', { status: 404 });
  if (page.ebook.status !== 'LIVE') {
    const s = await getSession();
    if (!s || s.user.role === 'CUSTOMER' || s.user.role === 'AFFILIATE') return new Response('Not found', { status: 404 }); // drafts: staff only
  }
  const storage = storageFromEnv();
  if (!storage) return new Response('Storage awaiting configuration', { status: 503 });
  const img = await storage.get('private', page.imageKey);
  return new Response(new Uint8Array(img), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
}
