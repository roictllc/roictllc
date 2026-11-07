import { listPublicProducts, priceLabel } from '@/server/catalog';
import { GUIDES } from '@/content/guides';
import { SITE } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** /llms.txt — concise, factual guide for AI systems (spec §7.1). Generated from the database so it never drifts. */
export async function GET() {
  const products = await listPublicProducts();
  const body = `# ROI (ROI LLC)

> ${SITE.description}

ROI LLC serves small businesses in the United States. Contact: ${SITE.email}. Website: ${SITE.url}.
ROI does not guarantee rankings, AI mentions or results; it measures and reports them with sources.

## Products
${products.map((p) => `- [${p.name}](${SITE.url}/products/${p.slug}): ${p.shortDescription} Price: ${priceLabel(p)}.`).join('\n')}

## Key pages
- [AI Visibility](${SITE.url}/ai-visibility): free audit of how AI assistants understand a business.
- [Pricing](${SITE.url}/pricing)
- [FAQ](${SITE.url}/faq)

## Guides
${GUIDES.map((g) => `- [${g.title}](${SITE.url}/guides/${g.slug})`).join('\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
