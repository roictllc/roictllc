import Link from 'next/link';
import { AI_ENGINES, engineLabel } from '@roi/product-engine/ai-visibility';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, Input, PageHeader, Pill, Select, Stat, Table, Textarea } from '@/components/ui';
import { can } from '@/server/authz';
import { recordMentionCheckAction } from '@/server/actions/ai-visibility';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';

export const metadata = { title: 'AI Visibility' };

export default async function AiVisibilityAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const canEnter = await can(user, 'ai_visibility.manual_entry');
  const tracked = canEnter ? await db().aiTrackedQuestion.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 300, include: { checks: { orderBy: { checkedAt: 'desc' }, take: 1 } } }) : [];
  const recentChecks = await db().aiMentionCheck.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { question: { select: { question: true, workspaceId: true } } } });
  const wsNames = new Map((await db().businessWorkspace.findMany({ where: { id: { in: [...new Set([...tracked.map((t) => t.workspaceId), ...recentChecks.map((c) => c.question.workspaceId)])] } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]));
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
      {canEnter && (
        <Card className="mb-8">
          <h2 className="font-display text-lg font-semibold">Log a manual check</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">For engines without compliant API access: ask the question in a clean session, then record exactly what the answer said. One entry per question, engine and day.</p>
          <ActionForm action={recordMentionCheckAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <CsrfField />
            <Select name="questionId" aria-label="Tracked question" required className="md:col-span-2">{tracked.map((t) => <option key={t.id} value={t.id}>{wsNames.get(t.workspaceId) ?? '—'}: {t.question}{t.checks[0] ? ` (last ${t.checks[0].checkedAt.toISOString().slice(0, 10)})` : ' (never checked)'}</option>)}</Select>
            <Select name="engine" aria-label="Engine" required>{AI_ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</Select>
            <Input name="checkedOn" type="date" aria-label="Checked on" required defaultValue={new Date().toISOString().slice(0, 10)} />
            <Select name="mentioned" aria-label="Mentioned?" required><option value="no">Not mentioned</option><option value="yes">Mentioned</option></Select>
            <Input name="position" type="number" min={1} max={50} aria-label="Position if mentioned" placeholder="Position (if mentioned)" />
            <Select name="sentiment" aria-label="Sentiment" defaultValue=""><option value="">Sentiment (optional)</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></Select>
            <Input name="citedSources" aria-label="Cited sources" placeholder="Cited source URLs (space or comma separated)" />
            <Textarea name="answer" aria-label="Answer excerpt" rows={3} placeholder="Answer excerpt (optional)" className="md:col-span-2" />
            <div><SubmitButton size="sm">Save check</SubmitButton></div>
          </ActionForm>
          <h3 className="mt-6 font-display font-semibold">Latest checks</h3>
          <Table head={['When', 'Business', 'Question', 'Engine', 'Result', 'Method']} empty="No checks yet."
            rows={recentChecks.map((c) => [c.checkedAt.toISOString().slice(0, 10), wsNames.get(c.question.workspaceId) ?? '—', <span key="q" className="block max-w-xs truncate">{c.question.question}</span>, engineLabel(c.engine), c.mentioned ? `mentioned${c.position ? ` #${c.position}` : ''}` : 'not mentioned', c.method])} />
        </Card>
      )}
      <Table head={['Business', 'City', 'Category', 'Score', 'Status', 'Lead email', 'When', '']} empty="No audits yet — they appear when visitors run the free audit."
        rows={audits.map((a) => [a.businessName, a.city, a.category, a.score ?? '—', <Pill key="s" tone={a.status === 'COMPLETED' ? 'success' : a.status === 'FAILED' ? 'danger' : 'info'}>{a.status}</Pill>, a.email ?? '—', a.createdAt.toISOString().slice(0, 16).replace('T', ' '), <Link key="l" href={`/ai-visibility/report/${a.shareToken}`} className="text-sm text-[var(--color-primary)]">Report ↗</Link>])} />
    </>
  );
}
