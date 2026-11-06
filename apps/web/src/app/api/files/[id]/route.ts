import { getSession } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { presignGet, storageConfigured } from '@/server/storage';

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
  if (!storageConfigured()) return new Response('File storage is awaiting configuration', { status: 503 });
  await audit('file.download', { actorId: s.user.id, actorRole: s.user.role, targetType: 'GeneratedDeliverable', targetId: f.id });
  return Response.redirect(await presignGet(process.env.R2_BUCKET_PRIVATE!, f.storageKey, 300, f.fileName), 302);
}
