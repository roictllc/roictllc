import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';

export const metadata = { title: 'Support' };

export default async function SupportAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const tickets = await db().supportTicket.findMany({ where: ws === null ? {} : { workspaceId: { in: ws } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, include: { workspace: { select: { name: true } }, _count: { select: { messages: true } } } });
  return (
    <>
      <PageHeader title="Support" intro="Open, in progress, waiting for customer, escalated, resolved, closed — with SLA timers and assistant reply suggestions." />
      <Table head={['#', 'Subject', 'Business', 'Status', 'Priority', 'Messages', 'SLA due', 'Opened']} empty="No tickets."
        rows={tickets.map((t) => [t.number, t.subject, t.workspace.name, <Pill key="s" tone={statusTone(t.status)}>{t.status.replace(/_/g, ' ')}</Pill>, t.priority, t._count.messages, t.slaDueAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—', t.createdAt.toISOString().slice(0, 10)])} />
    </>
  );
}
