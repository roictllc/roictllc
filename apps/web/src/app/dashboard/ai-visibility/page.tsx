import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { ButtonLink, Card, Input, PageHeader, Pill, Stat, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { addTrackedQuestionAction } from '@/server/actions/customer';

export const metadata = { title: 'AI Visibility' };

export default async function CustomerAiVisibility() {
  const { workspaceId, data } = await requireCustomer();
  const [audits, questions] = await Promise.all([
    db().aiVisibilityAudit.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    data.aiTrackedQuestion.findMany({ where: { active: true }, include: { checks: { orderBy: { checkedAt: 'desc' }, take: 12 } } }),
  ]);
  const checks = questions.flatMap((q) => q.checks);
  const rate = checks.length ? Math.round((checks.filter((c) => c.mentioned).length / checks.length) * 100) : null;
  const engines = [...new Set(checks.map((c) => c.engine))];
  const last = audits.find((a) => a.status === 'COMPLETED');
  return (
    <>
      <PageHeader title="AI Visibility" intro="How AI assistants understand your business, and how often they mention you for real customer questions." actions={<ButtonLink href="/ai-visibility#audit" size="sm">Run a new audit</ButtonLink>} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="AI visibility score" value={last?.score ?? '—'} hint={last ? `Audit ${last.createdAt.toISOString().slice(0, 10)}` : 'No audit yet'} tone="violet" />
        <Stat label="Mention rate" value={rate !== null ? `${rate}%` : '—'} hint={checks.length ? `${checks.length} checks across ${engines.length} engine(s)` : 'No checks recorded yet'} tone="success" />
        <Stat label="Tracked questions" value={questions.length} hint="Free: up to 10" />
      </div>
      <Card>
        <h2 className="font-display text-lg font-semibold">Questions your customers ask</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Write them the way a customer would, e.g. “best family dentist in Tampa that takes Delta Dental”.</p>
        <ActionForm action={addTrackedQuestionAction} className="mt-4 flex flex-col gap-3 sm:flex-row"><CsrfField /><Input name="question" required minLength={8} placeholder="Add a question" aria-label="Question" /><SubmitButton>Add</SubmitButton></ActionForm>
        <div className="mt-6">
          <Table head={['Question', 'Latest result', 'Engine', 'Method', 'Checked']} empty="No questions yet."
            rows={questions.map((q) => {
              const c = q.checks[0];
              return [q.question, c ? <Pill key="r" tone={c.mentioned ? 'success' : 'neutral'}>{c.mentioned ? `mentioned${c.position ? ` #${c.position}` : ''}` : 'not mentioned'}</Pill> : 'awaiting first check', c?.engine ?? '—', c ? (c.method === 'API' ? 'official API' : 'manual check by ROI') : '—', c?.checkedAt.toISOString().slice(0, 10) ?? '—'];
            })} />
        </div>
      </Card>
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Audit history</h2>
      <Table head={['Date', 'Website', 'Score', '']} empty="No audits yet." rows={audits.map((a) => [a.createdAt.toISOString().slice(0, 10), a.url, a.score ?? a.status, <a key="r" href={`/ai-visibility/report/${a.shareToken}`} className="text-sm text-[var(--color-primary)]">Report</a>])} />
    </>
  );
}
