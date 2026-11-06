import type { Metadata } from 'next';

/** SEO/AEO helpers (spec §7.1): unique metadata, canonical, OG/Twitter, consistent entity facts in JSON-LD. */
export const SITE = {
  name: 'ROI',
  legalName: 'ROI LLC',
  url: (process.env.APP_URL ?? 'https://roictllc.com').replace(/\/$/, ''),
  email: 'roictllc@gmail.com',
  tagline: 'Your Investment. Our Intelligence. Measurable Growth.',
  description: 'ROI makes AI assistants like ChatGPT recommend your business, runs your social media on autopilot, and builds the websites, logos and SEO that grow US small businesses.',
  foundingYear: 2026,
  areaServed: 'United States',
};

export function pageMeta(opts: { title: string; description: string; path: string; noindex?: boolean; ogTitle?: string }): Metadata {
  const url = `${SITE.url}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: opts.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type: 'website', url, siteName: SITE.name, title: opts.ogTitle ?? opts.title, description: opts.description, locale: 'en_US' },
    twitter: { card: 'summary_large_image', title: opts.ogTitle ?? opts.title, description: opts.description },
  };
}

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.name,
  legalName: SITE.legalName,
  url: SITE.url,
  email: SITE.email,
  slogan: SITE.tagline,
  foundingDate: String(SITE.foundingYear),
  areaServed: { '@type': 'Country', name: 'United States' },
  logo: `${SITE.url}/icon.svg`,
  knowsAbout: ['AI visibility', 'Generative engine optimization', 'Answer engine optimization', 'Local SEO', 'Social media automation', 'Website hosting', 'Logo design'],
});

export const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#website`,
  url: SITE.url,
  name: SITE.name,
  publisher: { '@id': `${SITE.url}/#organization` },
  inLanguage: 'en-US',
});

export const breadcrumbLd = (items: Array<{ name: string; path: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE.url}${it.path}` })),
});

export const faqLd = (faq: Array<{ q: string; a: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
