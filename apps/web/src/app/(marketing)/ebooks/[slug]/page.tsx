import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { JsonLd } from '@/components/json-ld';
import { PreviewImage } from '@/components/protected-media';
import { SubmitButton } from '@/components/submit-button';
import { ButtonLink, Card, Container, Pill } from '@/components/ui';
import { db } from '@/server/db';
import { getFlag } from '@/server/catalog';
import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { ebookPageUrl } from '@/server/ebooks';
import { pageMeta, SITE } from '@/lib/seo';
import { buyEbookAction } from '@/server/actions/ebooks';

async function load(slug: string) {
  return db().eBook.findFirst({ where: { slug, status: 'LIVE', archivedAt: null }, include: { category: true, previewPages: { orderBy: { pageNumber: 'asc' } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await load((await params).slug);
  if (!b) return { title: 'Not found' };
  return pageMeta({ title: `${b.title} by ${b.author}`, description: b.description.slice(0, 155), path: `/ebooks/${b.slug}` });
}

/** Book page: description, cover, sample viewer (page images through signed URLs, no PDF), buy (spec Product 4). */
export default async function EbookPage({ params }: { params: Promise<{ slug: string }> }) {
  const b = await load((await params).slug);
  if (!b) notFound();
  const [s, checkout, product] = await Promise.all([getSession(), getFlag('checkout'), db().product.findUnique({ where: { slug: 'ebook-library' }, select: { visibility: true } })]);
  const ws = s?.user.role === 'CUSTOMER' ? await customerWorkspaceId(s.user.id) : null;
  const owned = ws ? await db().eBookPurchase.findFirst({ where: { ebookId: b.id, workspaceId: ws } }) : null;
  const open = checkout === 'LIVE' && product?.visibility === 'LIVE';
  return (
    <Container className="py-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--color-muted)]"><Link href="/ebooks">E-books</Link> / <Link href={`/ebooks?c=${b.category.slug}`}>{b.category.name}</Link></nav>
      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.coverKey && <img src={`/api/ebooks/cover/${b.id}`} alt={`Cover of ${b.title}`} className="w-full rounded-xl bg-white shadow-2xl" />}
        </div>
        <div>
          <Pill tone="violet">{b.category.name}</Pill>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">{b.title}</h1>
          {b.subtitle && <p className="mt-2 text-xl text-[var(--color-muted)]">{b.subtitle}</p>}
          <p className="mt-2">by {b.author} · {b.pageCount} pages · {b.language.toUpperCase()}</p>
          <p className="mt-6 whitespace-pre-line leading-relaxed text-[var(--color-muted)]">{b.description}</p>
          <Card className="mt-8" glow>
            <div className="flex items-baseline justify-between"><p className="font-display text-lg font-semibold">Full PDF</p><p className="font-mono text-2xl">{formatUsd(b.priceCents)}</p></div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Delivered by email and kept in your ROI library. Each copy is personalized to the buyer.</p>
            <div className="mt-4">
              {owned ? <ButtonLink href="/dashboard/products">In your library →</ButtonLink>
                : !open ? <p className="text-sm">Purchases open soon.</p>
                : s?.user.role === 'CUSTOMER' ? (
                  <ActionForm action={buyEbookAction} className="space-y-3">
                    <CsrfField /><input type="hidden" name="ebookId" value={b.id} />
                    <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> I agree that delivery starts immediately after payment and accept the <Link href="/legal/terms" className="underline">Terms</Link> and <Link href="/legal/refund-policy" className="underline">Refund Policy</Link>.</label>
                    <SubmitButton pendingText="Opening secure checkout…">Buy the book</SubmitButton>
                  </ActionForm>
                ) : <ButtonLink href={`/register?next=${encodeURIComponent(`/ebooks/${b.slug}`)}`}>Create a free account to buy</ButtonLink>}
            </div>
          </Card>
        </div>
      </div>
      {b.previewPages.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Read the first pages of Chapter 1</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Sample pages {b.previewPages[0].pageNumber}–{b.previewPages.at(-1)!.pageNumber} of {b.pageCount}.</p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {b.previewPages.map((p) => <PreviewImage key={p.id} src={ebookPageUrl(p.id)} alt={`Sample page ${p.pageNumber}`} className="rounded-xl bg-white p-2" />)}
          </div>
        </section>
      )}
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Book', name: b.title, author: { '@type': 'Person', name: b.author }, numberOfPages: b.pageCount, inLanguage: b.language, bookFormat: 'https://schema.org/EBook', url: `${SITE.url}/ebooks/${b.slug}`, offers: { '@type': 'Offer', price: (b.priceCents / 100).toFixed(2), priceCurrency: 'USD', availability: open ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder' } }} />
    </Container>
  );
}
