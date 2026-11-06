import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink, Card, Container, Pill, SectionHeading } from './ui';
import { JsonLd } from './json-ld';
import { listPublicProducts, priceLabel } from '@/server/catalog';
import { breadcrumbLd, faqLd, SITE } from '@/lib/seo';

/** Shared layout for service landing pages: answer-first intro, steps, related products from the DB, FAQ with schema. */
export async function ServicePage(props: {
  path: string; eyebrow: string; title: ReactNode; plainTitle: string; answer: string; cta: { href: string; label: string };
  steps: Array<[string, string]>; productSlugs: string[]; faq: Array<{ q: string; a: string }>; extra?: ReactNode;
}) {
  const products = (await listPublicProducts()).filter((p) => props.productSlugs.includes(p.slug));
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="roi-aurora opacity-80" aria-hidden />
        <Container className="relative py-16 lg:py-24">
          <Pill tone="info">{props.eyebrow}</Pill>
          <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{props.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--color-muted)]">{props.answer}</p>
          <div className="mt-8"><ButtonLink href={props.cta.href} size="lg">{props.cta.label}</ButtonLink></div>
        </Container>
      </section>
      <Container className="py-12">
        <SectionHeading eyebrow="How it works" title="What happens, step by step" />
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {props.steps.map(([t, d], i) => (
            <Card as="li" key={t}><span className="font-mono text-sm text-[var(--color-primary)]">Step {i + 1}</span><h3 className="mt-2 font-display text-lg font-semibold">{t}</h3><p className="mt-2 text-sm text-[var(--color-muted)]">{d}</p></Card>
          ))}
        </ol>
      </Container>
      {props.extra}
      {products.length > 0 && (
        <Container className="py-12">
          <SectionHeading eyebrow="Products" title="Choose what you need" />
          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}><Link href={`/products/${p.slug}`} className="block h-full"><Card className="h-full hover:border-[var(--color-primary)]"><p className="font-mono text-sm text-[var(--color-primary)]">{priceLabel(p)}</p><h3 className="mt-2 font-display text-xl font-semibold">{p.name}</h3><p className="mt-2 text-[var(--color-muted)]">{p.shortDescription}</p></Card></Link></li>
            ))}
          </ul>
        </Container>
      )}
      <Container className="py-12">
        <SectionHeading eyebrow="Answers" title="Common questions" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {props.faq.map((f) => <Card key={f.q}><h3 className="font-display text-lg font-semibold">{f.q}</h3><p className="mt-2 leading-relaxed text-[var(--color-muted)]">{f.a}</p></Card>)}
        </div>
      </Container>
      <JsonLd data={[faqLd(props.faq), breadcrumbLd([{ name: 'Home', path: '/' }, { name: props.plainTitle, path: props.path }]), { '@context': 'https://schema.org', '@type': 'Service', name: props.plainTitle, provider: { '@id': `${SITE.url}/#organization` }, areaServed: 'US', url: `${SITE.url}${props.path}` }]} />
    </>
  );
}
