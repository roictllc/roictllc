import { storageFromEnv } from '@roi/product-engine/storage';
import { db } from '@/server/db';
import { getSession } from '@/server/session';

/** Book covers for the public catalog (LIVE books; staff can see drafts). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await db().eBook.findUnique({ where: { id }, select: { coverKey: true, status: true } });
  if (!book?.coverKey) return new Response('Not found', { status: 404 });
  if (book.status !== 'LIVE') {
    const s = await getSession();
    if (!s || s.user.role === 'CUSTOMER' || s.user.role === 'AFFILIATE') return new Response('Not found', { status: 404 });
  }
  const storage = storageFromEnv();
  if (!storage) return new Response('Storage awaiting configuration', { status: 503 });
  return new Response(new Uint8Array(await storage.get('private', book.coverKey)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': book.status === 'LIVE' ? 'public, max-age=3600' : 'no-store' } });
}
