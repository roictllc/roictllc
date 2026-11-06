import type { Metadata } from 'next';
import { Card, Container, SectionHeading } from '@/components/ui';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'About ROI LLC', description: 'ROI LLC builds the AI visibility, social automation, websites and branding that help US small businesses grow — measured honestly, controlled from one dashboard.', path: '/about' });

export default function AboutPage() {
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="About" title="ROI: Return on Investment, for every small business" intro="ROI LLC is a US company that turns marketing work small businesses never have time for into one automated platform: getting recommended by AI assistants, posting to social media, building and hosting websites, local SEO and branding." />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {[
          ['Our promise', 'Your Investment. Our Intelligence. Measurable Growth. Every number we show is measured, labeled with its source and age, and reconciled — or clearly marked as an estimate.'],
          ['How we build', 'ROI runs on its own engines: the assistant, logo and website generators and the social learning model work without paid third-party AI. That keeps prices low and your data in one place.'],
          ['Who we serve', 'Dentists, contractors, agencies, salons, restaurants, law and accounting firms and every local business across the United States.'],
        ].map(([t, d]) => <Card key={t}><h2 className="font-display text-xl font-semibold">{t}</h2><p className="mt-3 leading-relaxed text-[var(--color-muted)]">{d}</p></Card>)}
      </div>
      <Card className="mt-10">
        <h2 className="font-display text-xl font-semibold">Company facts</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--color-muted)]">Legal name</dt><dd>ROI LLC</dd></div>
          <div><dt className="text-[var(--color-muted)]">Brand</dt><dd>ROI (Return on Investment)</dd></div>
          <div><dt className="text-[var(--color-muted)]">Market</dt><dd>United States</dd></div>
          <div><dt className="text-[var(--color-muted)]">Contact</dt><dd><a className="text-[var(--color-primary)]" href="mailto:roictllc@gmail.com">roictllc@gmail.com</a></dd></div>
        </dl>
      </Card>
    </Container>
  );
}
