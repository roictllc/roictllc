import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { scoped, db } from '@/server/db';
import { audit } from '@/server/audit';

/** CCPA/CPRA data export (spec §6 Privacy): everything tied to the caller's workspace, secrets excluded. */
export async function GET() {
  const s = await getSession();
  if (!s || s.user.role !== 'CUSTOMER') return new Response('Unauthorized', { status: 401 });
  const ws = await customerWorkspaceId(s.user.id);
  if (!ws) return new Response('Not found', { status: 404 });
  const d = scoped(ws);
  const payload = {
    exportedAt: new Date().toISOString(),
    user: { email: s.user.email, name: s.user.name, createdAt: s.user.createdAt, emailVerifiedAt: s.user.emailVerifiedAt },
    workspace: await db().businessWorkspace.findUnique({ where: { id: ws }, include: { profile: true, brandKit: true } }),
    orders: await d.order.findMany({ include: { items: true } }),
    subscriptions: await d.subscription.findMany({}),
    invoices: await d.invoice.findMany({}),
    deliverables: await d.generatedDeliverable.findMany({ select: { fileName: true, kind: true, createdAt: true, sizeBytes: true } }),
    websites: await d.website.findMany({ include: { pages: true, leads: true } }),
    domains: await d.domain.findMany({}),
    socialAccounts: await d.socialAccount.findMany({ select: { platform: true, handle: true, postingMode: true, autopilot: true, autopilotConsentAt: true, createdAt: true } }),
    socialPosts: await d.socialPost.findMany({ select: { caption: true, hashtags: true, status: true, publishedAt: true, permalink: true } }),
    supportTickets: await d.supportTicket.findMany({ include: { messages: { where: { internal: false } } } }),
    aiVisibilityAudits: await db().aiVisibilityAudit.findMany({ where: { workspaceId: ws } }),
  };
  await audit('privacy.export', { actorId: s.user.id, actorRole: 'CUSTOMER', targetType: 'BusinessWorkspace', targetId: ws });
  return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="roi-data-export-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' } });
}
