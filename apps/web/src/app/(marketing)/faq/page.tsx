import type { Metadata } from 'next';
import { Card, Container, SectionHeading } from '@/components/ui';
import { JsonLd } from '@/components/json-ld';
import { listPublicProducts } from '@/server/catalog';
import { faqLd, pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Frequently asked questions', description: 'Answers about ROI’s AI visibility, websites, logos, domains, pricing, refunds, security and data.', path: '/faq' });

const GENERAL = [
  { q: 'Is ROI right for a small business?', a: 'Yes. ROI is built for US small businesses that want more customers without hiring a marketing team. Start with the free AI audit or a single product.' },
  { q: 'How is my data protected?', a: 'Passwords are stored as Argon2id hashes, sensitive tokens are encrypted, staff use two-factor authentication, payments go through Stripe, and every sensitive action is audit-logged.' },
  { q: 'Can I export or delete my data?', a: 'Yes. Use Settings → Privacy in your dashboard, or email roictllc@gmail.com.' },
  { q: 'What is your refund policy?', a: 'Automated products that fail our quality checks are refunded automatically. Delivered digital files are final unless defective. See the Refund Policy for subscriptions and domains.' },
];

export default async function FaqPage() {
  const products = await listPublicProducts();
  const all = [...GENERAL, ...products.flatMap((p) => p.faq)];
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">{all.map((f) => <Card key={f.q}><h2 className="font-display text-lg font-semibold">{f.q}</h2><p className="mt-2 leading-relaxed text-[var(--color-muted)]">{f.a}</p></Card>)}</div>
      <JsonLd data={faqLd(all)} />
    </Container>
  );
}
