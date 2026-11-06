import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUsd } from '@roi/shared-utils';
import { Card, Container, Pill, SectionHeading, Table } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { intervalLabel, listPublicProducts } from '@/server/catalog';
import { breadcrumbLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Pricing — clear prices for every ROI product', description: 'Transparent ROI pricing: websites $32/month, SEO from $19/month, local GEO from $11/month, animated GIF logo $21, logo packages from $24 and more. Domains under $15/year included.', path: '/pricing' });

export default async function PricingPage() {
  const products = await listPublicProducts();
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="Pricing" title="Simple prices. No surprises." intro="All prices in USD. Sales tax is calculated at checkout where it applies. Subscriptions can be cancelled anytime." center />
      <Card className="mx-auto mt-10 max-w-3xl">
        <h2 className="font-display text-lg font-semibold">The domain rule, in one sentence</h2>
        <p className="mt-2 text-[var(--color-muted)]">If a domain’s yearly price (the higher of its first-year and renewal price) is <strong className="text-[var(--color-text)]">under $15.00</strong>, ROI pays for it while your website subscription is active; at <strong className="text-[var(--color-text)]">$15.00 or more</strong>, you pay the full price at registration and each renewal.</p>
      </Card>
      <div className="mt-12">
        <Table head={['Product', 'Plan', 'Price', 'Status']}
          rows={products.flatMap((p) => p.plans.filter((pl) => pl.published).map((pl, i) => [
            i === 0 ? <Link key="p" href={`/products/${p.slug}`} className="font-semibold text-[var(--color-primary)] hover:underline">{p.name}</Link> : '',
            pl.name,
            <span key="pr" className="font-mono">{pl.price ? (pl.price.amountCents === 0 ? 'Free' : `${formatUsd(pl.price.amountCents)}${intervalLabel(pl.price.interval)}`) : p.kind === 'QUOTE' ? 'Custom quote' : 'Per book'}</span>,
            p.visibility === 'LIVE' ? <Pill key="s" tone="success">Available</Pill> : <Pill key="s" tone="neutral">Coming soon</Pill>,
          ]))} />
      </div>
      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">Social Autopilot and AI Visibility plans are being finalized — <Link href="/register" className="text-[var(--color-primary)] hover:underline">create a free account</Link> to be first in line.</p>
      <JsonLd data={breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }])} />
    </Container>
  );
}
