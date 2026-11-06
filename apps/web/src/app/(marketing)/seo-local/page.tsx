import type { Metadata } from 'next';
import { ServicePage } from '@/components/service-page';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'SEO & local (GEO) optimization for US businesses', description: 'Managed SEO from $19/month and local GEO optimization from $11/month: technical audits, safe automatic fixes, local pages, schema and monthly reports. No ranking guarantees.', path: '/seo-local' });

export default function SeoLocalPage() {
  return (
    <ServicePage path="/seo-local" eyebrow="SEO & Local · Products 6 & 7" plainTitle="SEO & local optimization"
      title={<>Get found on Google, Maps <span className="roi-gradient-text">and AI search</span>.</>}
      answer="ROI’s managed SEO audits your website every month, ranks fixes by impact and effort, and applies safe fixes automatically on ROI-hosted sites with one-click rollback. Local GEO optimization adds unique location pages, local schema and name-address-phone consistency checks for the areas you really serve. Data is labeled measured or estimated; rankings are never guaranteed."
      cta={{ href: '/products/managed-seo', label: 'See SEO plans' }}
      steps={[['Verify & crawl', 'We verify ownership and crawl your site safely, respecting robots.txt.'], ['Prioritize', 'Every issue gets impact × effort so you fix what matters first.'], ['Fix automatically', 'On ROI sites, safe fixes go live with a change log and rollback.'], ['Report monthly', 'A clear PDF report: what changed, what we measured, what is next.']]}
      productSlugs={['managed-seo', 'local-geo', 'ai-visibility']}
      faq={[
        { q: 'Why is SEO $19 with an ROI website?', a: 'We can apply fixes directly on sites we host. The $19 plan requires an active ROI website ($32 + $19 = $51/month); sites hosted elsewhere are $35/month.' },
        { q: 'Will you create city pages for every town?', a: 'Only for areas you actually serve, only when the page has genuinely local content, and with a monthly cap. We do not build doorway pages.' },
      ]} />
  );
}
