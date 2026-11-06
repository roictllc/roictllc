import type { Metadata } from 'next';
import { ServicePage } from '@/components/service-page';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'Business websites with hosting — live preview in seconds', description: 'A fast, mobile-friendly website for your business with hosting, SSL, uptime monitoring and a lead inbox for $32/month. Domains under $15/year included.', path: '/websites' });

export default function WebsitesPage() {
  return (
    <ServicePage path="/websites" eyebrow="Websites & hosting · Product 5" plainTitle="Websites & hosting"
      title={<>Your website, <span className="roi-gradient-text">live in seconds</span>, managed for you.</>}
      answer="ROI builds a fast, mobile-friendly business website from your details and shows a live preview in about five seconds. For $32 a month ROI hosts it with SSL, uptime monitoring, a spam-protected contact form, a lead inbox and version history with one-click rollback. Domains under $15 a year are included while you subscribe."
      cta={{ href: '/products/landing-page-hosting', label: 'See plans & details' }}
      steps={[['Tell us about your business', 'Services, hours, service areas, photos and colors.'], ['Preview instantly', 'Industry-specific copy and layout rendered in about five seconds.'], ['Pick your domain', 'Under $15/year? Included. $15 or more? You pay the domain in full.'], ['Publish & manage', 'SSL, uptime checks, leads inbox, edits and rollbacks from your dashboard.']]}
      productSlugs={['landing-page-hosting', 'managed-seo', 'local-geo']}
      faq={[
        { q: 'Do I own my domain?', a: 'Yes. You are always the registrant (legal owner). ROI manages DNS for you and you can transfer out at any time.' },
        { q: 'Can I edit my site?', a: 'Yes. Edit every section from your dashboard; each publish creates a version you can roll back to.' },
        { q: 'Is the site fast and SEO-ready?', a: 'Sites are static HTML with optimized images, schema markup, sitemap and robots, and must pass accessibility and performance checks before publishing.' },
      ]} />
  );
}
