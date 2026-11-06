import { formatUsd } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';

export const metadata = { title: 'Orders' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const sp = await searchParams;
  const orders = await db().order.findMany({
    where: { ...(ws === null ? {} : { workspaceId: { in: ws } }), ...(sp.q ? { orderNumber: { contains: sp.q.toUpperCase() } } : {}), ...(sp.status ? { status: sp.status as never } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { workspace: { select: { name: true } }, items: { include: { product: { select: { name: true } } } } },
  });
  return (
    <>
      <PageHeader title="Orders" intro={ws === null ? 'All orders.' : 'Orders for the customers assigned to you.'} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Order number" aria-label="Order number" className="rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm" />
        <select name="status" defaultValue={sp.status ?? ''} aria-label="Status" className="rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm">
          <option value="">Any status</option>{['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELED'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="rounded-full border border-[var(--color-border)] px-4 text-sm">Filter</button>
      </form>
      <Table head={['Order', 'Business', 'Items', 'Total', 'Status', 'Created']} empty="No orders yet."
        rows={orders.map((o) => [<span key="n" className="font-mono">{o.orderNumber}</span>, o.workspace.name, o.items.map((i) => i.product.name).join(', '), formatUsd(o.totalCents), <Pill key="s" tone={statusTone(o.status)}>{o.status.replace(/_/g, ' ')}</Pill>, o.createdAt.toISOString().slice(0, 16).replace('T', ' ')])} />
    </>
  );
}
