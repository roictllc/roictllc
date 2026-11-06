import { formatUsd } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Subscriptions' };

export default async function SubscriptionsPage() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM'] });
  await assertCan(user, 'customers.view_all');
  const subs = await db().subscription.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { workspace: { select: { name: true } }, price: { include: { plan: { include: { product: { select: { name: true } } } } } } } });
  return (
    <>
      <PageHeader title="Subscriptions" intro="Each subscription keeps the price version it was sold at until you migrate it deliberately." />
      <Table head={['Business', 'Product · plan', 'Price (version)', 'Status', 'Renews', 'Grace until']} empty="No subscriptions yet."
        rows={subs.map((s) => [s.workspace.name, `${s.price.plan.product.name} · ${s.price.plan.name}`, `${formatUsd(s.price.amountCents)}/${s.price.interval === 'YEAR' ? 'yr' : 'mo'} (v${s.price.version})`, <Pill key="s" tone={statusTone(s.status)}>{s.status}</Pill>, s.currentPeriodEnd?.toISOString().slice(0, 10) ?? '—', s.graceUntil?.toISOString().slice(0, 10) ?? '—'])} />
    </>
  );
}
