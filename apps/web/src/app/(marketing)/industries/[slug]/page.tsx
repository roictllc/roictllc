import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServicePage } from '@/components/service-page';
import { INDUSTRIES } from '@/content/industries';
import { pageMeta } from '@/lib/seo';

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const i = INDUSTRIES.find((x) => x.slug === slug);
  return i ? pageMeta({ title: i.title, description: i.description, path: `/industries/${i.slug}` }) : { title: 'Not found' };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = INDUSTRIES.find((x) => x.slug === slug);
  if (!i) notFound();
  return <ServicePage path={`/industries/${i.slug}`} eyebrow={`For ${i.name}`} plainTitle={i.title} title={i.headline} answer={i.answer} cta={{ href: '/ai-visibility#audit', label: 'Run the free AI audit' }} steps={i.steps} productSlugs={i.products} faq={i.faq} />;
}
