import Link from 'next/link';
import { PageHeader, Pill, Stat, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';

export const metadata = { title: 'AI Visibility' };

export default async function AiVisibilityAdmin() {
  await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const [audits, total, avg, questions] = await Promise.all([
    db().aiVisibilityAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    db().aiVisibilityAudit.count(),
    db().aiVisibilityAudit.aggregate({ _avg: { score: true }, where: { status: 'COMPLETED' } }),
    db().aiTrackedQuestion.count({ where: { active: true } }),
  ]);
  return (
    <>
      <PageHeader title="AI Visibility" intro="Free audits run as leads arrive. Tracked questions and mention checks (official APIs where allowed, otherwise logged manual checks by staff) feed each customer’s report." />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Audits run" value={total} />
        <Stat label="Average score" value={avg._avg.score ? Math.round(avg._avg.score) : '—'} tone="violet" />
        <Stat label="Tracked questions" value={questions} />
      </div>
      <Table head={['Business', 'City', 'Category', 'Score', 'Status', 'Lead email', 'When', '']} empty="No audits yet — they appear when visitors run the free audit."
        rows={audits.map((a) => [a.businessName, a.city, a.category, a.score ?? '—', <Pill key="s" tone={a.status === 'COMPLETED' ? 'success' : a.status === 'FAILED' ? 'danger' : 'info'}>{a.status}</Pill>, a.email ?? '—', a.createdAt.toISOString().slice(0, 16).replace('T', ' '), <Link key="l" href={`/ai-visibility/report/${a.shareToken}`} className="text-sm text-[var(--color-primary)]">Report ↗</Link>])} />
    </>
  );
}
