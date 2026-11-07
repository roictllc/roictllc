import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUsd } from '@roi/shared-utils';
import { Card, Container, SectionHeading } from '@/components/ui';
import { db } from '@/server/db';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'E-book library — business, leadership & growth books', description: 'Read the first three pages of Chapter 1 free, then buy the full PDF. Motivation, success, business, finance, leadership, marketing and productivity titles.', path: '/ebooks' });

/** Catalog with categories and full-text search over title, author, description and tags (spec Product 4). */
export default async function EbooksPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80);
  const cats = await db().eBookCategory.findMany({ orderBy: { name: 'asc' } });
  const cat = cats.find((c) => c.slug === sp.c);
  const books = await db().eBook.findMany({
    where: {
      status: 'LIVE', archivedAt: null, ...(cat ? { categoryId: cat.id } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { author: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] } : {}),
    },
    orderBy: { createdAt: 'desc' }, include: { category: true }, take: 60,
  });
  const live = await db().eBook.count({ where: { status: 'LIVE', archivedAt: null } });
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="E-book library" title="Books that help you grow" intro="Read the first three pages of Chapter 1 free. Purchases arrive by email and stay in your ROI library." />
      {live > 0 && (
        <form className="mt-8 flex flex-wrap gap-3" role="search">
          <label htmlFor="q" className="sr-only">Search books</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search title, author or topic" className="min-w-64 flex-1 rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm" />
          {cat && <input type="hidden" name="c" value={cat.slug} />}
          <button className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold">Search</button>
        </form>
      )}
      <p className="mt-6 flex flex-wrap gap-2">
        <Link href="/ebooks" className={`rounded-full border px-3 py-1 text-sm ${!cat ? 'border-[var(--color-primary)] text-[var(--color-text)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}>All</Link>
        {cats.map((c) => <Link key={c.id} href={`/ebooks?c=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full border px-3 py-1 text-sm ${cat?.id === c.id ? 'border-[var(--color-primary)] text-[var(--color-text)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}>{c.name}</Link>)}
      </p>
      {live === 0 ? (
        <Card className="mt-10 text-center"><p className="font-display text-xl font-semibold">The library opens soon</p><p className="mt-2 text-[var(--color-muted)]">We are adding titles we hold the rights to sell. Create a free account to be notified.</p></Card>
      ) : books.length === 0 ? (
        <p className="mt-10 text-[var(--color-muted)]">No books match. Try another word or category.</p>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/ebooks/${b.slug}`} className="group block h-full">
                <Card className="flex h-full flex-col transition group-hover:border-[var(--color-primary)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.coverKey && <img src={`/api/ebooks/cover/${b.id}`} alt="" className="mb-4 aspect-[3/4] w-full rounded-lg bg-white object-cover" loading="lazy" />}
                  <p className="text-xs text-[var(--color-primary)]">{b.category.name}</p>
                  <h2 className="mt-2 font-display text-lg font-semibold">{b.title}</h2>
                  <p className="text-sm text-[var(--color-muted)]">{b.author}</p>
                  <p className="mt-auto pt-3 font-mono">{formatUsd(b.priceCents)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
