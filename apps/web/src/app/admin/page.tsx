import Link from 'next/link';
import { formatUsd } from '@roi/shared-utils';
import { Card, PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { can, accessibleWorkspaceIds } from '@/server/authz';
import { PHASE_2_INTEGRATION_KEYS } from '@roi/integrations';

export const metadata = { title: 'Overview' };

export default async function AdminOverview() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const wsWhere = ws === null ? {} : { workspaceId: { in: ws } };
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const finance = await can(user, 'finance.view');
  const [customers, orders30, revenue30, activeSubs, queue, failed, heartbeat, integrations, recentOrders, audits, days] = await Promise.all([
    db().customer.count({ where: ws === null ? {} : { workspaceId: { in: ws } } }),
    db().order.count({ where: { ...wsWhere, createdAt: { gte: since30 }, status: { notIn: ['PENDING_PAYMENT', 'CANCELED'] } } }),
    db().financialTransaction.aggregate({ _sum: { amountCents: true }, where: { type: 'REVENUE', occurredAt: { gte: since30 }, ...(ws === null ? {} : { workspaceId: { in: ws } }) } }),
    db().subscription.findMany({ where: { ...wsWhere, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, include: { price: true } }),
    db().automationJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] }, ...(ws === null ? {} : { workspaceId: { in: ws } }) } }),
    db().automationJob.count({ where: { status: { in: ['FAILED', 'DEAD'] }, ...(ws === null ? {} : { workspaceId: { in: ws } }) } }),
    db().workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } }),
    db().integration.findMany({ where: { key: { notIn: PHASE_2_INTEGRATION_KEYS } }, orderBy: { name: 'asc' } }),
    db().order.findMany({ where: wsWhere, orderBy: { createdAt: 'desc' }, take: 6, include: { workspace: { select: { name: true } } } }),
    user.role === 'ADMIN' ? db().auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }) : Promise.resolve([]),
    db().$queryRaw<Array<{ d: Date; n: number }>>`SELECT date_trunc('day', "createdAt") AS d, count(*)::int AS n FROM orders WHERE "createdAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
  ]);
  const mrr = activeSubs.reduce((s, x) => s + (x.price.interval === 'MONTH' ? x.price.amountCents : x.price.interval === 'YEAR' ? Math.round(x.price.amountCents / 12) : 0), 0);
  const workerOk = heartbeat && Date.now() - heartbeat.lastBeatAt.getTime() < 120_000;
  const notConnected = integrations.filter((i) => i.status !== 'CONNECTED');
  const spark = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return days.find((d) => new Date(d.d).toISOString().slice(0, 10) === day)?.n ?? 0;
  });

  return (
    <>
      <PageHeader title={`Good ${new Date().getUTCHours() < 16 ? 'morning' : 'afternoon'}, ${user.name?.split(' ')[0] ?? 'there'}`} intro="Live numbers from the database. Nothing on this page is sample data." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {finance && <Stat label="Revenue · 30 days" value={formatUsd(revenue30._sum.amountCents ?? 0)} hint="Collected, from the ledger" tone="success" />}
        {finance && <Stat label="MRR" value={formatUsd(mrr)} hint={`${activeSubs.length} active subscriptions`} tone="violet" />}
        <Stat label="Customers" value={customers.toLocaleString('en-US')} hint={ws === null ? 'All workspaces' : 'Assigned to you'} />
        <Stat label="Orders · 30 days" value={orders30} spark={spark} hint="Paid or in progress" />
        <Stat label="Job queue" value={queue} hint={failed ? `${failed} failed — review in Jobs` : 'No failed jobs'} tone={failed ? 'danger' : 'info'} />
        <Stat label="Media worker" value={workerOk ? 'Online' : 'Offline'} hint={heartbeat ? `Last heartbeat ${heartbeat.lastBeatAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'No worker has connected yet'} tone={workerOk ? 'success' : 'warning'} />
      </div>

      {user.role === 'ADMIN' && notConnected.length > 0 && (
        <Card className="mt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Launch readiness</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{integrations.length - notConnected.length} of {integrations.length} integrations connected. Products that need a missing integration stay “coming soon” until it passes a live check.</p>
            </div>
            <Link href="/admin/integrations" className="shrink-0 text-sm font-semibold text-[var(--color-primary)] hover:underline">Open integrations →</Link>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {notConnected.slice(0, 9).map((i) => (
              <li key={i.key} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-white/[0.02] px-3 py-2 text-sm">
                <span>{i.name}</span>
                <Pill tone={statusTone(i.status)}>{i.status.replace(/_/g, ' ').toLowerCase()}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Recent orders</h2>
          <Table head={['Order', 'Business', 'Total', 'Status', 'Date']} empty="No orders yet — they appear here the moment a customer pays."
            rows={recentOrders.map((o) => [<Link key="o" href={`/admin/orders?q=${o.orderNumber}`} className="font-mono text-[var(--color-primary)]">{o.orderNumber}</Link>, o.workspace.name, formatUsd(o.totalCents), <Pill key="s" tone={statusTone(o.status)}>{o.status.replace(/_/g, ' ')}</Pill>, o.createdAt.toISOString().slice(0, 10)])} />
        </section>
        {user.role === 'ADMIN' && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Latest activity</h2>
            <Card className="p-0">
              <ul className="divide-y divide-[var(--color-border)]/50">
                {audits.length === 0 && <li className="p-4 text-sm text-[var(--color-muted)]">No activity yet.</li>}
                {audits.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-mono text-xs text-[var(--color-primary)]">{a.action}</span>
                    <span className="text-xs text-[var(--color-muted)]">{a.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
