import { formatUsd } from '@roi/shared-utils';
import { Alert, Card, PageHeader, Stat, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { can, ForbiddenError } from '@/server/authz';
import { financeSummary } from '@/server/finance';

export const metadata = { title: 'Finance' };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const full = await can(user, 'finance.view');
  const partial = await can(user, 'finance.revenue_by_product');
  if (!full && !partial) throw new ForbiddenError('finance.view');
  const days = Math.min(365, Math.max(7, Number((await searchParams).days ?? 30)));
  const s = await financeSummary(days);
  const expenses = full ? await db().businessExpense.findMany({ orderBy: { incurredOn: 'desc' }, take: 20 }) : [];
  return (
    <>
      <PageHeader title="Finance" intro="Every figure is computed from ledger rows (integer cents) and reconciles to them. Cash collected, recognized revenue and outstanding balances are kept separate."
        actions={<form className="flex gap-2">{[7, 30, 90, 365].map((d) => <button key={d} name="days" value={d} className={`rounded-full border px-3 py-1.5 text-sm ${d === days ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>{d}d</button>)}</form>} />
      {!full && <div className="mb-6"><Alert tone="info">You see revenue by product. Net profit, expenses and payouts are visible to admins only.</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cash collected" value={formatUsd(s.revenue)} tone="success" />
        <Stat label="Refunds" value={formatUsd(s.refunds)} tone="warning" />
        {full && <Stat label="Payment fees" value={formatUsd(s.fees)} />}
        {full && <Stat label="Gross profit" value={formatUsd(s.grossProfit)} tone="violet" hint="Revenue − refunds − fees − direct costs − commissions" />}
        {full && <Stat label="Operating expenses" value={formatUsd(s.opex)} />}
        {full && <Stat label="Net profit" value={formatUsd(s.netProfit)} tone={s.netProfit >= 0 ? 'success' : 'danger'} />}
        <Stat label="MRR" value={formatUsd(s.mrr)} hint={`ARR ${formatUsd(s.mrr * 12)}`} tone="violet" />
        <Stat label="Tax collected" value={formatUsd(s.tax)} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Revenue by product</h2>
          <Table head={['Product', 'Revenue', 'Orders']} empty="No revenue in this period." rows={s.byProduct.map((r) => [r.name, formatUsd(r.cents), r.orders])} />
        </section>
        {full && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Recent expenses</h2>
            <Table head={['Date', 'Category', 'Vendor', 'Amount', 'Source']} empty="No expenses recorded." rows={expenses.map((e) => [e.incurredOn.toISOString().slice(0, 10), e.category, e.vendor ?? '—', formatUsd(e.amountCents), e.automatic ? 'automatic' : 'manual'])} />
          </section>
        )}
      </div>
      {full && (
        <Card className="mt-8">
          <h2 className="font-display text-lg font-semibold">Ledger reconciliation</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Sum of ledger rows in the period: <span className="font-mono">{formatUsd(s.ledgerNet)}</span> · dashboard net before opex: <span className="font-mono">{formatUsd(s.revenue - s.refunds - s.fees - s.commissions - s.directCosts)}</span> {s.reconciled ? '✓ reconciled' : '⚠ mismatch — investigate'}</p>
        </Card>
      )}
    </>
  );
}
