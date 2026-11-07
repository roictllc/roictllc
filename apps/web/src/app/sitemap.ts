import type { MetadataRoute } from 'next';
import { listPublicProducts } from '@/server/catalog';
import { GUIDES } from '@/content/guides';
import { INDUSTRIES } from '@/content/industries';
import { SITE } from '@/lib/seo';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const statics = ['', '/ai-visibility', '/products', '/pricing', '/websites', '/seo-local', '/ai-for-business', '/ebooks', '/guides', '/about', '/contact', '/faq', '/status'];
  const products = await listPublicProducts().catch(() => []);
  const legal = await db().legalDocument.findMany({ select: { slug: true, updatedAt: true } }).catch(() => []);
  return [
    ...statics.map((p) => ({ url: `${SITE.url}${p}`, lastModified: now, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.8 })),
    ...products.map((p) => ({ url: `${SITE.url}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...GUIDES.map((g) => ({ url: `${SITE.url}/guides/${g.slug}`, lastModified: new Date(g.updated), priority: 0.6 })),
    ...INDUSTRIES.map((i) => ({ url: `${SITE.url}/industries/${i.slug}`, lastModified: now, priority: 0.6 })),
    ...legal.map((l) => ({ url: `${SITE.url}/legal/${l.slug}`, lastModified: l.updatedAt, priority: 0.2 })),
  ];
}
