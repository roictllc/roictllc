import type { Metadata } from 'next';
import { formatUsd } from '@roi/shared-utils';
import { Card, Container, SectionHeading } from '@/components/ui';
import { db } from '@/server/db';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'E-book library — business, leadership & growth books', description: 'Read the first three pages of Chapter 1 free, then buy the full PDF. Motivation, success, business, finance, leadership, marketing and productivity.', path: '/ebooks' });

export default async function EbooksPage() {
  const [cats, books] = await Promise.all([
    db().eBookCategory.findMany({ orderBy: { name: 'asc' } }),
    db().eBook.findMany({ where: { status: 'LIVE', archivedAt: null }, orderBy: { createdAt: 'desc' }, include: { category: true } }),
  ]);
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="E-book library · Product 4" title="Books that help you grow" intro="Read the first three pages of Chapter 1 free. Purchases arrive by email and stay in your ROI library." />
      <p className="mt-6 flex flex-wrap gap-2">{cats.map((c) => <span key={c.id} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-muted)]">{c.name}</span>)}</p>
      {books.length === 0 ? (
        <Card className="mt-10 text-center"><p className="font-display text-xl font-semibold">The library opens soon</p><p className="mt-2 text-[var(--color-muted)]">We are adding titles we hold the rights to sell. Create a free account to be notified.</p></Card>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {books.map((b) => <li key={b.id}><Card className="h-full"><p className="text-xs text-[var(--color-primary)]">{b.category.name}</p><h2 className="mt-2 font-display text-lg font-semibold">{b.title}</h2><p className="text-sm text-[var(--color-muted)]">{b.author}</p><p className="mt-3 font-mono">{formatUsd(b.priceCents)}</p></Card></li>)}
        </ul>
      )}
    </Container>
  );
}
