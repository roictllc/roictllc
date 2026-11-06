import { formatUsd } from '@roi/shared-utils';
import { Card, PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { appUrl } from '@/server/env';

/** Affiliate dashboard (spec §8.4): links, code, referred customers, pending/approved commissions, payouts. */
export default async function AffiliateHome() {
  const { user } = await requireUser({ roles: ['AFFILIATE'] });
  const a = await db().affiliateProfile.findUnique({ where: { userId: user.id }, include: { referrals: { orderBy: { clickedAt: 'desc' }, take: 50 }, commissions: { orderBy: { createdAt: 'desc' }, take: 50 }, payouts: { orderBy: { createdAt: 'desc' } } } });
  if (!a) return <PageHeader title="Affiliate" intro="Your affiliate profile is being set up." />;
  const sum = (s: string) => a.commissions.filter((c) => c.status === s).reduce((x, c) => x + c.amountCents, 0);
  return (
    <>
      <PageHeader title="Affiliate dashboard" intro={`Commission ${a.commissionBps / 100}% · status ${a.status.toLowerCase()}. Commissions become payable after the refund window.`} />
      <Card className="mb-6"><p className="text-sm text-[var(--color-muted)]">Your link</p><code className="mt-1 block break-all font-mono text-[var(--color-primary)]">{`${appUrl()}/?ref=${a.code}`}</code><p className="mt-2 text-sm text-[var(--color-muted)]">Code: <span className="font-mono">{a.code}</span> · last-click attribution</p></Card>
      <div className="mb-8 grid gap-4 sm:grid-cols-4"><Stat label="Referrals" value={a.referrals.length} /><Stat label="Pending" value={formatUsd(sum('PENDING'))} tone="warning" /><Stat label="Payable" value={formatUsd(sum('PAYABLE'))} tone="success" /><Stat label="Paid" value={formatUsd(sum('PAID'))} tone="violet" /></div>
      <h2 className="mb-3 font-display text-lg font-semibold">Commissions</h2>
      <Table head={['Date', 'Amount', 'Status', 'Payable after']} empty="No commissions yet." rows={a.commissions.map((c) => [c.createdAt.toISOString().slice(0, 10), formatUsd(c.amountCents), <Pill key="s" tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Pill>, c.holdUntil.toISOString().slice(0, 10)])} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Payouts</h2>
      <Table head={['Date', 'Amount', 'Status', 'Reference']} empty="No payouts yet." rows={a.payouts.map((p) => [p.createdAt.toISOString().slice(0, 10), formatUsd(p.amountCents), p.status, p.reference ?? '—'])} />
    </>
  );
}
