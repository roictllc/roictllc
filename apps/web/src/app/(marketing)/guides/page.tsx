import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Container, SectionHeading } from '@/components/ui';
import { GUIDES } from '@/content/guides';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Guides — practical growth guides for small businesses', description: 'Plain-English guides on getting recommended by AI assistants, email signatures, domains, local SEO and more.', path: '/guides' });

export default function GuidesIndex() {
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="Guides" title="Practical guides, written for people first" />
      <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}`} className="block h-full"><Card className="h-full hover:border-[var(--color-primary)]"><h2 className="font-display text-xl font-semibold">{g.title}</h2><p className="mt-2 text-[var(--color-muted)]">{g.description}</p><p className="mt-4 text-sm font-semibold text-[var(--color-primary)]">Read →</p></Card></Link></li>)}
      </ul>
    </Container>
  );
}
