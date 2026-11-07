import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';

export const metadata = { title: 'Customers' };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const { q } = await searchParams;
  const rows = await db().businessWorkspace.findMany({
    where: { archivedAt: null, ...(ws === null ? {} : { id: { in: ws } }), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { owner: { email: { contains: q, mode: 'insensitive' } } }] } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { owner: { select: { email: true, name: true, status: true, emailVerifiedAt: true } }, profile: { select: { industry: true, city: true, state: true } }, _count: { select: { orders: true, subscriptions: true, websites: true } } },
  });
  return (
    <>
      <PageHeader title="Customers" intro="Every business workspace with its owner, footprint and status." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Business or email" aria-label="Search customers" className="rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm" /><button className="rounded-full border border-[var(--color-border)] px-4 text-sm">Search</button></form>
      <Table head={['Business', 'Owner', 'Location', 'Orders', 'Subscriptions', 'Sites', 'Status', 'Joined']} empty="No customers yet."
        rows={rows.map((w) => [<span key="n" className="font-semibold">{w.name}</span>, <span key="o" className="text-sm">{w.owner.email}{w.owner.emailVerifiedAt ? '' : ' (unverified)'}</span>, [w.profile?.city, w.profile?.state].filter(Boolean).join(', ') || '—', w._count.orders, w._count.subscriptions, w._count.websites, <Pill key="s" tone={statusTone(w.owner.status)}>{w.owner.status}</Pill>, w.createdAt.toISOString().slice(0, 10)])} />
    </>
  );
}
