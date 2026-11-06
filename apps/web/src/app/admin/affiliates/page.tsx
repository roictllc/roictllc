import { formatUsd } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Affiliates' };

export default async function AffiliatesAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'affiliates.manage');
  const rows = await db().affiliateProfile.findMany({ include: { user: { select: { email: true, name: true } }, _count: { select: { referrals: true } }, commissions: { select: { amountCents: true, status: true } } } });
  return (
    <>
      <PageHeader title="Affiliates" intro="Last-click attribution; commissions become payable only after the refund/chargeback hold; clawbacks on refunds; self-referrals are blocked." />
      <Table head={['Affiliate', 'Code', 'Status', 'Rate', 'Referrals', 'Pending', 'Payable', 'Paid']} empty="No affiliates yet."
        rows={rows.map((a) => {
          const s = (st: string) => formatUsd(a.commissions.filter((c) => c.status === st).reduce((x, c) => x + c.amountCents, 0));
          return [a.user.name ?? a.user.email, <code key="c" className="font-mono">{a.code}</code>, <Pill key="s" tone={statusTone(a.status)}>{a.status}</Pill>, `${a.commissionBps / 100}%`, a._count.referrals, s('PENDING'), s('PAYABLE'), s('PAID')];
        })} />
    </>
  );
}
