import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Moderation & takedowns' };

export default async function ModerationAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM'] });
  await assertCan(user, 'moderation.manage');
  const [takedowns, reports, terms] = await Promise.all([
    db().takedown.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db().contentReport.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db().blockedTerm.findMany({ orderBy: { term: 'asc' } }),
  ]);
  return (
    <>
      <PageHeader title="Moderation & takedowns" intro="DMCA notices and counter-notices from /legal/takedown, content reports, and the blocked-term / brand list used by the automated policy scan." />
      <h2 className="mb-3 font-display text-lg font-semibold">Takedown notices</h2>
      <Table head={['Received', 'Kind', 'Claimant', 'URL', 'Status']} empty="No notices." rows={takedowns.map((t) => [t.createdAt.toISOString().slice(0, 10), t.kind, `${t.claimantName} <${t.claimantEmail}>`, <span key="u" className="block max-w-xs truncate">{t.url}</span>, <Pill key="s" tone={statusTone(t.status)}>{t.status}</Pill>])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Content reports</h2>
      <Table head={['Received', 'Target', 'Reason', 'Status']} empty="No reports." rows={reports.map((r) => [r.createdAt.toISOString().slice(0, 10), `${r.targetType} ${r.targetId.slice(-8)}`, r.reason, <Pill key="s" tone={statusTone(r.status)}>{r.status}</Pill>])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Blocked terms & brands</h2>
      <p className="text-sm text-[var(--color-muted)]">{terms.map((t) => `${t.term} (${t.severity.toLowerCase()})`).join(' · ')}</p>
    </>
  );
}
