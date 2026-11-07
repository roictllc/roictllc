import { getSession } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { presignGet, storageConfigured } from '@/server/storage';
import { storageFromEnv } from '@roi/product-engine/storage';
import { registerEbookDownload } from '@roi/product-engine/ebook-plan';
import { requestMeta } from '@/server/request';

/** Paid downloads (spec §6, §10): ownership check → short-lived signed URL. Previews never come through here. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const f = await db().generatedDeliverable.findUnique({ where: { id }, include: { orderItem: { include: { order: true } } } });
  if (!f || f.isPreview) return new Response('Not found', { status: 404 });
  const ws = await accessibleWorkspaceIds(s.user);
  if (ws !== null && !ws.includes(f.workspaceId)) return new Response('Not found', { status: 404 });
  if (f.orderItem && !['PAID', 'PROCESSING', 'COMPLETED'].includes(f.orderItem.order.status)) return new Response('Payment required', { status: 402 });
  // Files of an item still waiting for a manager's quality approval are not released yet (spec §10).
  const isStaff = s.user.role !== 'CUSTOMER';
  if (f.orderItem && f.orderItem.status !== 'COMPLETED' && !isStaff) return new Response('Your files are still being checked', { status: 409 });
  if (f.kind === 'ebook-pdf' && !isStaff) {
    const meta = await requestMeta();
    const r = await registerEbookDownload(db(), f.storageKey, { ip: meta.ip, userAgent: meta.userAgent });
    if (!r.ok) return new Response(`You reached the download limit for this book (${r.limit}). Contact support if you need another copy.`, { status: 429 });
  }
  await audit('file.download', { actorId: s.user.id, actorRole: s.user.role, targetType: 'GeneratedDeliverable', targetId: f.id });
  if (storageConfigured()) return Response.redirect(await presignGet(process.env.R2_BUCKET_PRIVATE!, f.storageKey, 300, f.fileName), 302);
  // Development only: local storage (refused in production by storageFromEnv).
  const local = storageFromEnv();
  if (!local) return new Response('File storage is awaiting configuration', { status: 503 });
  const body = await local.get('private', f.storageKey);
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}
