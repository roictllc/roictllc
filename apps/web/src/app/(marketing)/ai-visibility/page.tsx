import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, Container, Field, Input, Pill, SectionHeading } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { Turnstile } from '@/components/turnstile';
import { runAuditAction } from '@/server/actions/public';
import { breadcrumbLd, faqLd, pageMeta, SITE } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'AI Visibility — get your business recommended by ChatGPT, Gemini, Claude & Perplexity',
  description: 'Free AI visibility audit: see how ChatGPT and AI search understand your business, get a 0–100 score and the fixes that matter. ROI implements them and tracks your AI mention rate.',
  path: '/ai-visibility',
});

const FAQ = [
  { q: 'What is AI visibility?', a: 'AI visibility is how easily AI assistants such as ChatGPT, Gemini, Claude, Perplexity and Copilot can find, understand and confidently mention your business when a customer asks for a recommendation. It depends on clear entity facts, structured data, answer-ready content, consistent listings and reputation signals.' },
  { q: 'Is this the same as GEO or AEO?', a: 'They overlap. Generative engine optimization (GEO) and answer engine optimization (AEO) both mean preparing content so AI systems can quote and cite it. ROI’s AI Visibility service covers both, plus the business-entity work local companies need.' },
  { q: 'Can you guarantee ChatGPT will recommend me?', a: 'No. Nobody can force an AI engine to recommend a business, and anyone who promises that is not being honest. ROI improves the signals these systems rely on and measures your mention rate over time with clear data sources.' },
  { q: 'How do you measure AI mentions?', a: 'For each tracked customer question we record whether your business was mentioned, its position, the sources cited and the sentiment — through official APIs where the provider allows it, and through logged manual checks by our staff where it does not.' },
];

export default function AiVisibilityPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="roi-aurora" aria-hidden />
        <div className="roi-grid-bg absolute inset-0" aria-hidden />
        <Container className="relative grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <Pill tone="info">AI Visibility · Product 11</Pill>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Be the business <span className="roi-gradient-text">AI recommends</span>.</h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--color-muted)]">AI Visibility is ROI’s service for making ChatGPT, Gemini, Claude, Perplexity and Copilot understand and surface your business. We score how AI reads your website, implement the fixes, and track how often engines mention you for the questions your customers really ask.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {['AI crawler access & llms.txt', 'Entity clarity (name, address, phone)', 'Structured data that AI trusts', 'Answer-ready pages & FAQs', 'Consistent listings & sameAs', 'Monthly mention-rate tracking'].map((x) => (
                <li key={x} className="flex items-center gap-2 text-sm"><span aria-hidden className="grid size-5 place-items-center rounded-full bg-[rgb(0_229_255/0.15)] text-xs text-[var(--color-primary)]">✓</span>{x}</li>
              ))}
            </ul>
          </div>
          <Card className="roi-gradient-border !bg-[var(--color-surface-solid)] p-7" glow>
            <div id="audit" className="scroll-mt-28">
              <h2 className="font-display text-2xl font-semibold">Free AI Visibility audit</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">About a minute. No credit card. Your report gets a private link you can share.</p>
              <ActionForm action={runAuditAction} className="mt-6 space-y-4">
                <CsrfField />
                <Field label="Business name" name="businessName"><Input name="businessName" required placeholder="Bayview Family Dental" /></Field>
                <Field label="Website" name="url"><Input name="url" required placeholder="yourbusiness.com" inputMode="url" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City" name="city"><Input name="city" required placeholder="Tampa" /></Field>
                  <Field label="What you do" name="category"><Input name="category" required placeholder="family dentist" /></Field>
                </div>
                <Field label="Email (optional — we’ll send the report)" name="email"><Input name="email" type="email" placeholder="you@business.com" /></Field>
                <Turnstile />
                <SubmitButton className="w-full" size="lg" pendingText="Checking how AI sees you…">Run my free audit</SubmitButton>
                <p className="text-xs text-[var(--color-muted)]">We fetch only your public pages, robots.txt, llms.txt and sitemap, identifying ourselves as ROIBot.</p>
              </ActionForm>
            </div>
          </Card>
        </Container>
      </section>
      <Container className="py-16">
        <SectionHeading eyebrow="Answers" title="AI visibility, explained" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map((f) => (
            <Card key={f.q}><h3 className="font-display text-lg font-semibold">{f.q}</h3><p className="mt-2 leading-relaxed text-[var(--color-muted)]">{f.a}</p></Card>
          ))}
        </div>
      </Container>
      <JsonLd data={[faqLd(FAQ), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'AI Visibility', path: '/ai-visibility' }]), { '@context': 'https://schema.org', '@type': 'Service', name: 'AI Visibility', serviceType: 'Generative engine optimization', provider: { '@id': `${SITE.url}/#organization` }, areaServed: 'US', url: `${SITE.url}/ai-visibility` }]} />
    </>
  );
}
