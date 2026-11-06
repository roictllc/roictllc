import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { Alert, ButtonLink, Card, Container, Pill } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { getFlag, getPublicProduct, intervalLabel, listPublicProducts } from '@/server/catalog';
import { breadcrumbLd, faqLd, pageMeta, SITE } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublicProduct((await params).slug);
  if (!p) return { title: 'Not found' };
  return pageMeta({ title: p.seoTitle.replace(/ \| ROI$/, ''), description: p.seoDescription, path: `/products/${p.slug}` });
}

const EXTRA_LINKS: Record<string, { href: string; label: string }> = {
  'ai-visibility': { href: '/ai-visibility#audit', label: 'Run the free AI audit' },
  'social-autopilot': { href: '/social-media', label: 'See how Autopilot works' },
  'ai-business-integration': { href: '/ai-for-business#quote', label: 'Request a quote' },
  'ebook-library': { href: '/ebooks', label: 'Browse the library' },
  'animated-gif-logo': { href: '/guides/add-animated-gif-logo-to-gmail-signature', label: 'Gmail signature guide' },
};

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPublicProduct((await params).slug);
  if (!p) notFound();
  const checkout = (await getFlag('checkout')) === 'LIVE';
  const purchasable = checkout && p.visibility === 'LIVE';
  const plans = p.plans.filter((pl) => pl.published);
  const related = (await listPublicProducts()).filter((x) => x.category.slug === p.category.slug && x.slug !== p.slug).slice(0, 3);
  const extra = EXTRA_LINKS[p.slug];
  const offers = plans.filter((pl) => pl.price && pl.price.amountCents >= 0).map((pl) => ({
    '@type': 'Offer', name: pl.name, price: (pl.price!.amountCents / 100).toFixed(2), priceCurrency: 'USD', url: `${SITE.url}/products/${p.slug}`,
    availability: purchasable ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', areaServed: 'US',
    ...(pl.price!.interval !== 'ONE_TIME' ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: (pl.price!.amountCents / 100).toFixed(2), priceCurrency: 'USD', unitCode: pl.price!.interval === 'MONTH' ? 'MON' : 'ANN' } } : {}),
  }));

  return (
    <article>
      <section className="relative overflow-hidden">
        <div className="roi-aurora opacity-60" aria-hidden />
        <Container className="relative grid gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--color-muted)]"><a href="/" className="hover:text-[var(--color-text)]">Home</a> / <a href="/products" className="hover:text-[var(--color-text)]">Products</a> / <span className="text-[var(--color-text)]">{p.name}</span></nav>
            <Pill tone="violet">{p.category.name}</Pill>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{p.name}</h1>
            <p className="mt-4 text-xl text-[var(--color-muted)]">{p.tagline}</p>
            <div className="mt-8 rounded-[var(--radius-lg)] border-l-4 border-[var(--color-primary)] bg-white/[0.03] p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">In short</h2>
              <p className="mt-2 text-lg leading-relaxed">{p.answerFirst}</p>
            </div>
            {extra && <div className="mt-6"><ButtonLink href={extra.href} variant="secondary">{extra.label} →</ButtonLink></div>}
          </div>
          <aside className="space-y-4">
            {plans.length === 0 && <Card><p className="font-semibold">Pricing coming soon</p><p className="mt-1 text-sm text-[var(--color-muted)]">{p.kind === 'QUOTE' ? 'This service is quoted for your business.' : 'We are finalizing plans for this product.'}</p></Card>}
            {plans.map((pl) => (
              <Card key={pl.id} glow={pl.isDefault} className={pl.isDefault ? 'roi-gradient-border !bg-[var(--color-surface-solid)]' : ''}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold">{pl.name}</h3>
                  <p className="font-mono text-2xl font-semibold">{pl.price ? (pl.price.amountCents === 0 ? 'Free' : <>{formatUsd(pl.price.amountCents)}<span className="text-sm text-[var(--color-muted)]">{intervalLabel(pl.price.interval)}</span></>) : p.kind === 'QUOTE' ? 'Quote' : '—'}</p>
                </div>
                <ul className="mt-4 space-y-2 text-sm">{pl.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-[var(--color-success)]">✓</span>{f}</li>)}</ul>
                <div className="mt-5">
                  {pl.price?.amountCents === 0 && p.slug === 'ai-visibility' ? <ButtonLink href="/ai-visibility#audit" className="w-full">Run free audit</ButtonLink>
                    : purchasable && pl.price ? <ButtonLink href={`/checkout?plan=${pl.id}`} className="w-full">Get started</ButtonLink>
                    : p.kind === 'QUOTE' ? <ButtonLink href="/ai-for-business#quote" className="w-full">Request a quote</ButtonLink>
                    : <ButtonLink href={`/register?next=${encodeURIComponent(`/products/${p.slug}`)}`} variant="secondary" className="w-full">Coming soon — create a free account</ButtonLink>}
                </div>
              </Card>
            ))}
            {!purchasable && p.kind !== 'QUOTE' && <p className="text-xs text-[var(--color-muted)]">Online checkout opens soon. Create a free account and we’ll let you know.</p>}
          </aside>
        </Container>
      </section>

      <Container className="grid gap-10 py-12 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="font-display text-2xl font-semibold">What you get</h2>
          <p className="mt-3 text-lg leading-relaxed text-[var(--color-muted)]">{p.longDescription}</p>
          {p.honesty && <div className="mt-6"><Alert tone="info" title="Straight talk">{p.honesty}</Alert></div>}
          <h2 className="mt-12 font-display text-2xl font-semibold">Frequently asked questions</h2>
          <div className="mt-5 space-y-3">
            {p.faq.map((f) => (
              <div key={f.q} className="roi-glass rounded-[var(--radius-lg)] p-5">
                <h3 className="font-display text-lg font-semibold">{f.q}</h3>
                <p className="mt-2 leading-relaxed text-[var(--color-muted)]">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
        {related.length > 0 && (
          <aside>
            <h2 className="font-display text-lg font-semibold">Related</h2>
            <ul className="mt-4 space-y-3">{related.map((r) => <li key={r.id}><a href={`/products/${r.slug}`} className="block rounded-xl border border-[var(--color-border)] p-4 hover:border-[var(--color-primary)]"><p className="font-semibold">{r.name}</p><p className="text-sm text-[var(--color-muted)]">{r.tagline}</p></a></li>)}</ul>
          </aside>
        )}
      </Container>
      <JsonLd data={[
        { '@context': 'https://schema.org', '@type': p.kind === 'SUBSCRIPTION' || p.kind === 'QUOTE' ? 'Service' : 'Product', name: p.name, description: p.shortDescription, brand: { '@type': 'Brand', name: 'ROI' }, provider: { '@id': `${SITE.url}/#organization` }, areaServed: 'US', url: `${SITE.url}/products/${p.slug}`, ...(offers.length ? { offers } : {}) },
        faqLd(p.faq),
        breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: p.name, path: `/products/${p.slug}` }]),
      ]} />
    </article>
  );
}
