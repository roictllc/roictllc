import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORY_LABELS, type Category, type Check } from '@roi/seo-engine';
import { Alert, ButtonLink, Card, Container, Pill } from '@/components/ui';
import { db } from '@/server/db';

export const metadata: Metadata = { title: 'AI Visibility report', robots: { index: false, follow: false } };

function Gauge({ score }: { score: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? '#00F5A0' : score >= 45 ? '#FFC400' : '#FF4D5E';
  return (
    <svg viewBox="0 0 180 180" className="size-44" role="img" aria-label={`AI visibility score ${score} out of 100`}>
      <circle cx="90" cy="90" r={r} stroke="rgb(255 255 255 / 0.08)" strokeWidth="14" fill="none" />
      <circle cx="90" cy="90" r={r} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 90 90)" style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
      <text x="90" y="98" textAnchor="middle" className="fill-[var(--color-text)] font-mono" fontSize="44" fontWeight="700">{score}</text>
      <text x="90" y="124" textAnchor="middle" className="fill-[var(--color-muted)]" fontSize="12">out of 100</text>
    </svg>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await db().aiVisibilityAudit.findUnique({ where: { shareToken: token } });
  if (!a) notFound();
  if (a.status !== 'COMPLETED') {
    return <Container className="py-20"><Alert tone="danger" title="This audit did not complete">{String((a.fixes as { error?: string })?.error ?? 'Please try again.')}</Alert></Container>;
  }
  const data = a.fixes as unknown as { checks: Check[]; fixes: string[]; fetched: { url: string; robots: boolean; llms: boolean; sitemap: boolean } };
  const breakdown = a.breakdown as unknown as Record<Category, { points: number; max: number }>;
  const fixes = data.fixes.map((id) => data.checks.find((c) => c.id === id)!).filter(Boolean);
  return (
    <Container className="py-14">
      <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
        <Gauge score={a.score ?? 0} />
        <div>
          <Pill tone="info">AI Visibility report · {a.createdAt.toISOString().slice(0, 10)}</Pill>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{a.businessName}</h1>
          <p className="mt-2 text-[var(--color-muted)]">{a.category} · {a.city} · checked <span className="font-mono">{data.fetched.url}</span></p>
          <p className="mt-4 max-w-2xl">{(a.score ?? 0) >= 75 ? 'AI systems can understand this business well. Keep content fresh and track mentions to stay ahead.' : (a.score ?? 0) >= 45 ? 'AI systems can partly understand this business. The fixes below will make it far easier to recommend.' : 'AI systems will struggle to understand and recommend this business today. The fixes below are the fastest wins.'}</p>
        </div>
      </div>

      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(breakdown) as Category[]).map((k) => {
          const pct = Math.round((breakdown[k].points / breakdown[k].max) * 100);
          return (
            <Card key={k} className="p-5">
              <p className="text-sm font-semibold">{CATEGORY_LABELS[k]}</p>
              <p className="mt-2 font-mono text-2xl">{breakdown[k].points}<span className="text-sm text-[var(--color-muted)]">/{breakdown[k].max}</span></p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full roi-gradient" style={{ width: `${pct}%` }} /></div>
            </Card>
          );
        })}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Fix these first</h2>
        <ol className="mt-5 space-y-3">
          {fixes.map((f, i) => (
            <li key={f.id} className="roi-glass flex gap-4 rounded-[var(--radius-lg)] p-5">
              <span className="font-mono text-xl text-[var(--color-primary)]">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <p className="font-semibold">{f.label} <Pill tone={f.impact === 3 ? 'danger' : f.impact === 2 ? 'warning' : 'neutral'} className="ml-2">{f.impact === 3 ? 'high impact' : f.impact === 2 ? 'medium impact' : 'low impact'}</Pill></p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{f.detail}</p>
                <p className="mt-2 text-sm">{f.fix}</p>
              </div>
            </li>
          ))}
          {fixes.length === 0 && <Alert tone="success">No major issues found. Next step: track how often AI engines mention you.</Alert>}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Everything we checked</h2>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {data.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm">
              <span aria-hidden className={c.passed ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>{c.passed ? '✓' : '!'}</span>
              <span><span className="font-semibold">{c.label}</span> <span className="font-mono text-xs text-[var(--color-muted)]">{c.points}/{c.max}</span><br /><span className="text-[var(--color-muted)]">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <Card className="mt-12 text-center" glow>
        <h2 className="font-display text-2xl font-semibold">Want ROI to fix this for you?</h2>
        <p className="mx-auto mt-2 max-w-xl text-[var(--color-muted)]">We implement the fixes, publish answer-ready pages and track your AI mention rate every month. No engine can be forced to recommend anyone — we improve the signals they rely on and show you the data.</p>
        <div className="mt-6 flex justify-center gap-3"><ButtonLink href="/register?next=/dashboard/ai-visibility">Start with ROI</ButtonLink><ButtonLink href="/contact" variant="secondary">Talk to us</ButtonLink></div>
      </Card>
      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">This report reflects your public homepage, robots.txt, llms.txt and sitemap at the time of the check. Listings and review counts are reviewed in the paid plan.</p>
    </Container>
  );
}
