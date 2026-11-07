import { engineLabel, mentionStats } from '@roi/product-engine/ai-visibility';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { ButtonLink, Card, DataAge, Input, PageHeader, Pill, Stat, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { addTrackedQuestionAction } from '@/server/actions/customer';
import { requestAiReportAction } from '@/server/actions/ai-visibility';

export const metadata = { title: 'AI Visibility' };

/** Product 11 customer dashboard (spec §12): score, per-engine mention rate with data age, trend, questions, reports. */
export default async function CustomerAiVisibility() {
  const { workspaceId, data } = await requireCustomer();
  const [audits, questions, reports] = await Promise.all([
    db().aiVisibilityAudit.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    data.aiTrackedQuestion.findMany({ where: { active: true }, include: { checks: { orderBy: { checkedAt: 'desc' }, take: 60 } } }),
    data.generatedDeliverable.findMany({ where: { kind: 'ai-visibility-report' }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const checks = questions.flatMap((q) => q.checks);
  const stats = mentionStats(checks);
  const last = audits.find((a) => a.status === 'COMPLETED');
  const fixes = ((last?.fixes as Array<{ title?: string; impact?: string }> | null) ?? []).slice(0, 3);
  return (
    <>
      <PageHeader title="AI Visibility" intro="How AI assistants understand your business, and how often they mention you for real customer questions. Nobody can force an AI to recommend a business — we improve how AI understands and surfaces you, and measure it honestly." actions={<ButtonLink href="/ai-visibility#audit" size="sm" variant="secondary">Run a new audit</ButtonLink>} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="AI visibility score" value={last?.score ?? '—'} hint={last ? `Audit ${last.createdAt.toISOString().slice(0, 10)}` : 'No audit yet'} tone="violet" />
        <Stat label="Mention rate · 30 days" value={stats.overall !== null ? `${stats.overall}%` : '—'} hint={stats.checks ? `${stats.checks} checks` : 'No checks recorded yet'} tone="success" spark={stats.weekly.map((w) => w ?? 0)} />
        <Stat label="Tracked questions" value={questions.length} hint="Free: up to 10" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="font-display text-lg font-semibold">By engine</h2>
          <Table head={['Engine', 'Mention rate', 'Avg. position', 'Checks', 'Data age']} rows={stats.perEngine.map((e) => [e.label, e.rate === null ? '—' : `${e.rate}%`, e.avgPosition ?? '—', e.checks, e.lastCheckedAt ? <DataAge key="a" at={e.lastCheckedAt} source="checks" /> : 'not checked'])} />
          <p className="mt-2 text-xs text-[var(--color-muted)]">Measured only through official APIs where allowed, or checks logged by ROI staff. Engines without data show “—”.</p>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold">Next best actions</h2>
          {fixes.length ? <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{fixes.map((f, i) => <li key={i}>{f.title}{f.impact ? <span className="text-[var(--color-muted)]"> · impact {f.impact}</span> : null}</li>)}</ol> : <p className="mt-2 text-sm text-[var(--color-muted)]">Run the free audit to get your prioritized fix list.</p>}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold">Questions your customers ask</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Write them the way a customer would, e.g. “best family dentist in Tampa that takes Delta Dental”.</p>
        <ActionForm action={addTrackedQuestionAction} className="mt-4 flex flex-col gap-3 sm:flex-row"><CsrfField /><Input name="question" required minLength={8} placeholder="Add a question" aria-label="New tracked question" /><SubmitButton>Track it</SubmitButton></ActionForm>
        <div className="mt-6">
          <Table head={['Question', 'Latest result', 'Engine', 'Method', 'Checked']} empty="No questions yet."
            rows={questions.map((q) => {
              const c = q.checks[0];
              return [q.question, c ? <Pill key="r" tone={c.mentioned ? 'success' : 'neutral'}>{c.mentioned ? `mentioned${c.position ? ` #${c.position}` : ''}` : 'not mentioned'}</Pill> : 'awaiting first check', c ? engineLabel(c.engine) : '—', c?.method ?? '—', c ? c.checkedAt.toISOString().slice(0, 10) : '—'];
            })} />
        </div>
      </Card>
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Monthly reports</h2>
          <ActionForm action={requestAiReportAction} className="flex items-center gap-3"><CsrfField /><SubmitButton size="sm" variant="secondary" pendingText="Requesting…">Create this month’s report now</SubmitButton></ActionForm>
        </div>
        <Table head={['Report', 'Created', '']} empty="Your first report arrives at the start of next month." rows={reports.map((r) => [r.fileName, r.createdAt.toISOString().slice(0, 10), <a key="d" href={`/api/files/${r.id}`} className="text-[var(--color-primary)]">Download PDF</a>])} />
      </Card>
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Audit history</h2>
      <Table head={['Date', 'Website', 'Score', '']} empty="No audits yet." rows={audits.map((a) => [a.createdAt.toISOString().slice(0, 10), a.url, a.score ?? a.status, <a key="r" href={`/ai-visibility/report/${a.shareToken}`} className="text-[var(--color-primary)]">Open report</a>])} />
    </>
  );
}
