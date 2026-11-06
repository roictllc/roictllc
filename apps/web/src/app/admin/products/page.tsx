import Link from 'next/link';
import { computeMargin, formatUsd, DEFAULT_COST_MODEL } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Products & pricing' };

export default async function AdminProducts() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  await assertCan(user, 'products.manage');
  const products = await db().product.findMany({ where: { archivedAt: null }, orderBy: { number: 'asc' }, include: { costModel: true, plans: { where: { archivedAt: null }, include: { prices: { orderBy: { version: 'desc' }, take: 1 } } } } });
  return (
    <>
      <PageHeader title="Products & pricing" intro="Edit names, copy, prices and visibility. Every price edit creates a new version; the margin guard blocks prices under your minimum unless you record a reason." />
      <Table head={['#', 'Product', 'Plans & current prices', 'Lowest margin', 'Visibility', '']}
        rows={products.map((p) => {
          const priced = p.plans.filter((pl) => pl.prices[0] && pl.prices[0].amountCents > 0);
          const margins = priced.map((pl) => computeMargin(pl.prices[0].amountCents, { ...DEFAULT_COST_MODEL, ...(p.costModel ?? {}) }));
          const low = margins.length ? margins.reduce((a, b) => (a.marginBps < b.marginBps ? a : b)) : null;
          return [
            <span key="n" className="font-mono text-[var(--color-muted)]">{p.number}</span>,
            <span key="name" className="font-semibold">{p.name}</span>,
            <span key="pl" className="text-sm">{p.plans.map((pl) => `${pl.name}: ${pl.prices[0] ? `${formatUsd(pl.prices[0].amountCents)}${pl.prices[0].interval === 'MONTH' ? '/mo' : pl.prices[0].interval === 'YEAR' ? '/yr' : ''}` : p.kind === 'QUOTE' ? 'quote' : 'per item'}${pl.published ? '' : ' (draft)'}`).join(' · ')}</span>,
            low ? <Pill key="m" tone={low.belowMinimum ? 'danger' : 'success'}>{(low.marginBps / 100).toFixed(1)}%</Pill> : <span key="m" className="text-[var(--color-muted)]">—</span>,
            <Pill key="v" tone={statusTone(p.visibility)}>{p.visibility.replace('_', ' ')}</Pill>,
            <Link key="e" href={`/admin/products/${p.id}`} className="text-sm font-semibold text-[var(--color-primary)] hover:underline">Edit →</Link>,
          ];
        })} />
    </>
  );
}
