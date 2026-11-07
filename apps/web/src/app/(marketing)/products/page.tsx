import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Container, Pill, SectionHeading } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { listPublicProducts, priceLabel } from '@/server/catalog';
import { breadcrumbLd, pageMeta, SITE } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Products — AI visibility, websites, logos & SEO', description: 'Every ROI product in one place: AI Visibility, websites with hosting, managed SEO, local optimization, animated logos, logo generator, email signatures, e-books and AI integration.', path: '/products' });

export default async function ProductsIndex() {
  const products = await listPublicProducts();
  const groups = [...new Map(products.map((p) => [p.category.slug, p.category.name])).entries()];
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="Products" title="Everything ROI builds and runs for you" intro="ROI is one platform with ten products. Each runs on our own engines, shows progress live in your dashboard, and lists its real price." />
      {groups.map(([slug, name]) => (
        <section key={slug} className="mt-14" aria-labelledby={`cat-${slug}`}>
          <h2 id={`cat-${slug}`} className="font-display text-2xl font-semibold">{name}</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.filter((p) => p.category.slug === slug).map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.slug}`} className="group block h-full">
                  <Card className="flex h-full flex-col transition group-hover:-translate-y-0.5 group-hover:border-[var(--color-primary)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-[var(--color-primary)]">{priceLabel(p)}</span>
                      {p.visibility === 'COMING_SOON' && <Pill tone="neutral">Coming soon</Pill>}
                    </div>
                    <h3 className="mt-3 font-display text-xl font-semibold">{p.name}</h3>
                    <p className="mt-2 flex-1 text-[var(--color-muted)]">{p.shortDescription}</p>
                    <span className="mt-4 text-sm font-semibold text-[var(--color-primary)]">Details →</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <JsonLd data={[breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }]), { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.url}/products/${p.slug}`, name: p.name })) }]} />
    </Container>
  );
}
