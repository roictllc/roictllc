import { storageFromEnv } from '@roi/product-engine/storage';
import { getSession } from '@/server/session';
import { can } from '@/server/authz';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { presignGet, storageConfigured } from '@/server/storage';

/** Full book source: ADMIN/PM/MANAGER only, every access audited (spec Product 4 access model). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !(await can(s.user, 'ebooks.source')) || !s.session.twoFactorVerifiedAt) return new Response('Not found', { status: 404 });
  const { id } = await params;
  const book = await db().eBook.findUnique({ where: { id } });
  if (!book?.sourceKey) return new Response('Not found', { status: 404 });
  await audit('ebook.source_accessed', { actorId: s.user.id, actorRole: s.user.role, targetType: 'EBook', targetId: book.id });
  if (storageConfigured()) return Response.redirect(await presignGet(process.env.R2_BUCKET_PRIVATE!, book.sourceKey, 120, `${book.slug}.pdf`), 302);
  const local = storageFromEnv();
  if (!local) return new Response('File storage is awaiting configuration', { status: 503 });
  return new Response(new Uint8Array(await local.get('private', book.sourceKey)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${book.slug}.pdf"`, 'Cache-Control': 'no-store, private' } });
}
