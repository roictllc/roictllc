import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ButtonLink, Card, Container } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { GUIDES } from '@/content/guides';
import { breadcrumbLd, pageMeta, SITE } from '@/lib/seo';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  return g ? pageMeta({ title: g.title, description: g.description, path: `/guides/${g.slug}` }) : { title: 'Not found' };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  return (
    <Container className="max-w-3xl py-16">
      <article>
        <p className="text-sm text-[var(--color-muted)]">Guide · updated {g.updated}</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight">{g.title}</h1>
        <div className="mt-8 rounded-[var(--radius-lg)] border-l-4 border-[var(--color-primary)] bg-white/[0.03] p-5"><p className="text-lg leading-relaxed">{g.answer}</p></div>
        {g.howTo && (
          <Card className="mt-8"><h2 className="font-display text-xl font-semibold">Quick steps</h2><ol className="mt-4 list-decimal space-y-2 pl-6">{g.howTo.map((s) => <li key={s}>{s}</li>)}</ol></Card>
        )}
        {g.sections.map((s) => (
          <section key={s.h} className="mt-10"><h2 className="font-display text-2xl font-semibold">{s.h}</h2>{s.body.map((p, i) => <p key={i} className="mt-4 leading-relaxed text-[var(--color-muted)]">{p}</p>)}</section>
        ))}
        <Card className="mt-12 text-center"><p className="font-display text-xl font-semibold">Want ROI to handle this for you?</p><div className="mt-4"><ButtonLink href="/ai-visibility#audit">Run the free AI audit</ButtonLink></div></Card>
      </article>
      <JsonLd data={[
        { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, dateModified: g.updated, datePublished: g.updated, author: { '@id': `${SITE.url}/#organization` }, publisher: { '@id': `${SITE.url}/#organization` }, mainEntityOfPage: `${SITE.url}/guides/${g.slug}` },
        ...(g.howTo ? [{ '@context': 'https://schema.org', '@type': 'HowTo', name: g.title, step: g.howTo.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) }] : []),
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides' }, { name: g.title, path: `/guides/${g.slug}` }]),
      ]} />
    </Container>
  );
}
