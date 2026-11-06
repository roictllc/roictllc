import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Card, Container, Pill, SectionHeading } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { listPublicProducts, priceLabel } from '@/server/catalog';
import { faqLd, pageMeta } from '@/lib/seo';
import { PlatformChip } from '@/components/platform-chip';

export const metadata: Metadata = pageMeta({
  title: 'ROI — Get recommended by ChatGPT & AI search. Social media on autopilot.',
  description: 'ROI makes ChatGPT, Gemini, Claude and Perplexity understand and surface your business, posts to Instagram, TikTok, Facebook and X for you, and builds your website, logo and SEO.',
  path: '/',
});

const HOME_FAQ = [
  { q: 'How do I get ChatGPT to recommend my business?', a: 'AI assistants recommend businesses they can clearly identify and trust. ROI audits how AI engines read your business, fixes structured data, entity facts, answer-ready content and listings, then tracks how often engines mention you for real customer questions. No one can force an AI to recommend a business; we improve the signals it relies on.' },
  { q: 'What does “social media on autopilot” mean?', a: 'You connect Instagram, TikTok, Facebook and X once. ROI studies your market and your own results, plans a 30-day calendar, creates on-brand posts and publishes them at the best times. You can switch to approve-first or pause at any time.' },
  { q: 'Do you guarantee results?', a: 'No. Nobody can honestly promise rankings, AI mentions or engagement. ROI shows measured data with its source and age, labels estimates as estimates, and reports what changed every month.' },
  { q: 'Who is ROI for?', a: 'Small and growing US businesses — dentists, contractors, agencies, salons, restaurants, law and accounting firms — that want more customers without hiring a marketing team.' },
];

export default async function HomePage() {
  const products = await listPublicProducts();
  return (
    <>
      {/* ── HERO: AI Visibility (spec v4 §7.0) ── */}
      <section className="relative overflow-hidden roi-noise">
        <div className="roi-aurora" aria-hidden />
        <div className="roi-grid-bg absolute inset-0" aria-hidden />
        <Container className="relative grid items-center gap-12 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div className="animate-rise">
            <Pill tone="info" className="mb-6"><span aria-hidden>●</span> New · AI Visibility for US businesses</Pill>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              When customers ask <span className="roi-gradient-text">ChatGPT, Gemini, Claude or Perplexity</span> who to hire — ROI makes sure the answer is you.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]">
              ROI makes AI assistants understand, trust and recommend your business — with the structured data, answer-ready content and consistent listings they rely on, and monthly proof of how often they mention you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/ai-visibility#audit" size="lg">Get recommended by AI</ButtonLink>
              <ButtonLink href="#how" variant="secondary" size="lg">See how it works</ButtonLink>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted)]">Free AI visibility audit · no credit card · results in about a minute</p>
          </div>

          <div className="relative animate-rise [animation-delay:150ms]">
            <div className="roi-gradient-border p-1 shadow-[0_0_80px_-20px_rgb(123_63_255/0.7)]">
              <div className="rounded-[calc(var(--radius-xl)-2px)] bg-[var(--color-surface-solid)] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">AI assistant · answer preview</span>
                  <Pill tone="violet">Illustration</Pill>
                </div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[rgb(123_63_255/0.35)] px-4 py-3 text-sm">Who’s the best family dentist near downtown Tampa that takes new patients?</div>
                <div className="mt-4 space-y-2 rounded-2xl rounded-bl-sm bg-white/5 px-4 py-3 text-sm leading-relaxed">
                  <p>Here are well-reviewed options near downtown Tampa:</p>
                  <p className="rounded-xl border border-[rgb(0_229_255/0.5)] bg-[rgb(0_229_255/0.08)] px-3 py-2"><strong className="text-[var(--color-primary)]">1. Bayview Family Dental</strong> — accepting new patients, open Saturdays, clear pricing for cleanings. <span className="text-[var(--color-muted)]">(bayviewfamilydental.example)</span></p>
                  <p className="text-[var(--color-muted)]">2. …</p>
                </div>
                <p className="mt-4 text-xs text-[var(--color-muted)]">Sample business for illustration. Real answers vary by engine, question and time.</p>
              </div>
            </div>
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full bg-[var(--color-accent)]/30 blur-2xl animate-float" />
          </div>
        </Container>
      </section>

      {/* ── 3 steps ── */}
      <section id="how" className="scroll-mt-24">
        <Container className="py-16">
          <SectionHeading eyebrow="How AI Visibility works" title={<>Three steps from invisible to <span className="roi-gradient-text">recommended</span></>} center />
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ['01', 'We audit', 'We score how well AI engines can read your business: crawlability, entity facts, schema, answer-ready content, listings and reviews.'],
              ['02', 'We make you AI-readable', 'We implement the fixes — JSON-LD, llms.txt, answer pages, entity profile and consistent listings — on your ROI site or as ready-to-paste snippets.'],
              ['03', 'You get recommended', 'We track real customer questions across engines and report your mention rate, position and cited sources every month.'],
            ].map(([n, t, d]) => (
              <Card key={n} as="li" className="relative overflow-hidden">
                <span className="font-mono text-5xl font-bold text-white/5">{n}</span>
                <h3 className="-mt-4 font-display text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-[var(--color-muted)]">{d}</p>
              </Card>
            ))}
          </ol>
        </Container>
      </section>

      {/* ── Social Autopilot band ── */}
      <section className="relative overflow-hidden">
        <Container className="py-12">
          <div className="roi-gradient-border p-1">
            <div className="grid gap-10 rounded-[calc(var(--radius-xl)-2px)] bg-[linear-gradient(135deg,rgb(11_16_36),rgb(20_10_40))] p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
              <div>
                <Pill tone="violet" className="mb-5">Social Autopilot</Pill>
                <h2 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Connect your Instagram, TikTok, Facebook and X once. <span className="roi-gradient-text">ROI studies your market, posts for you</span> and shows the results live.</h2>
                <p className="mt-4 text-lg text-[var(--color-muted)]">No more posting. ROI learns which formats, topics and times earn engagement for your business, then plans, creates and publishes — or asks first, if you prefer.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/social-media" size="lg">Put my social on autopilot</ButtonLink>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-3" id="connect">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Connect in one click each</p>
                {(['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'X'] as const).map((p) => (
                  <Link key={p} href={`/register?next=${encodeURIComponent('/dashboard/social')}`} className="group flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white/5 px-4 py-3 transition hover:border-[var(--color-primary)] hover:bg-white/10">
                    <PlatformChip platform={p} />
                    <span className="text-sm text-[var(--color-muted)] group-hover:text-[var(--color-text)]">Connect →</span>
                  </Link>
                ))}
                <p className="text-xs text-[var(--color-muted)]">Official platform APIs only. ROI never likes, follows or comments for you.</p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Products ── */}
      <section>
        <Container className="py-16">
          <SectionHeading eyebrow="One platform" title="Everything a growing business needs, controlled from one dashboard" intro="Every product runs on ROI’s own engines and shows its progress live in your workspace." />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.slug}`} className="group block h-full">
                  <Card className="flex h-full flex-col transition group-hover:-translate-y-0.5 group-hover:border-[var(--color-primary)]">
                    <div className="flex items-center justify-between">
                      <Pill tone={p.category.slug === 'ai' || p.category.slug === 'social' ? 'violet' : 'info'}>{p.category.name}</Pill>
                      <span className="font-mono text-sm text-[var(--color-muted)]">{priceLabel(p)}</span>
                    </div>
                    <h3 className="mt-4 font-display text-xl font-semibold">{p.name}</h3>
                    <p className="mt-2 flex-1 text-[var(--color-muted)]">{p.tagline}</p>
                    <span className="mt-4 text-sm font-semibold text-[var(--color-primary)]">Learn more →</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ── Honesty ── */}
      <section>
        <Container className="grid gap-6 py-12 md:grid-cols-3">
          {[
            ['Measured, not promised', 'Every number shows where it came from and how old it is. Estimates are labeled as estimates.'],
            ['Built in, not bolted on', 'ROI’s assistant, generators and analysis run on our own engines — no surprise AI bills.'],
            ['You stay in control', 'Approve-first or autopilot, pause anytime, export your data, and own your domain.'],
          ].map(([t, d]) => (
            <Card key={t}>
              <h3 className="font-display text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-[var(--color-muted)]">{d}</p>
            </Card>
          ))}
        </Container>
      </section>

      {/* ── FAQ (AEO) ── */}
      <section>
        <Container className="py-16">
          <SectionHeading eyebrow="Answers" title="Questions business owners ask us" center />
          <div className="mx-auto mt-10 max-w-3xl space-y-3">
            {HOME_FAQ.map((f) => (
              <details key={f.q} className="roi-glass group rounded-[var(--radius-lg)] p-5">
                <summary className="cursor-pointer list-none font-display text-lg font-semibold">
                  <h3 className="inline">{f.q}</h3>
                </summary>
                <p className="mt-3 leading-relaxed text-[var(--color-muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <section>
        <Container className="pb-8">
          <Card className="relative overflow-hidden text-center" glow>
            <div className="roi-aurora opacity-60" aria-hidden />
            <div className="relative py-8">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">See how AI sees your business — free.</h2>
              <p className="mx-auto mt-3 max-w-xl text-[var(--color-muted)]">Enter your website and get a 0–100 AI visibility score with the fixes that matter most.</p>
              <div className="mt-6"><ButtonLink href="/ai-visibility#audit" size="lg">Run my free AI audit</ButtonLink></div>
            </div>
          </Card>
        </Container>
      </section>
      <JsonLd data={faqLd(HOME_FAQ)} />
    </>
  );
}
