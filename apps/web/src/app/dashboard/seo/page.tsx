import { ButtonLink, Card, PageHeader, Pill, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';

export const metadata = { title: 'SEO & local' };

export default async function SeoDashboard() {
  const { data } = await requireCustomer();
  const [audits, keywords] = await Promise.all([data.seoAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { findings: { where: { fixedAt: null }, orderBy: { impact: 'desc' }, take: 8 } } }), data.keywordSuggestion.findMany({ orderBy: { score: 'desc' }, take: 20 })]);
  if (audits.length === 0) {
    return (<><PageHeader title="SEO & local" /><Card className="text-center"><p className="font-display text-xl font-semibold">No SEO audits yet</p><p className="mt-2 text-[var(--color-muted)]">Managed SEO audits your site monthly and fixes safe issues automatically on ROI-hosted sites.</p><div className="mt-5"><ButtonLink href="/products/managed-seo">See SEO plans</ButtonLink></div></Card></>);
  }
  const last = audits[0];
  return (
    <>
      <PageHeader title="SEO & local" intro="Rankings are never guaranteed. Data is labeled measured (Google Search Console) or estimated." />
      <Card><p className="text-sm text-[var(--color-muted)]">Latest audit · {last.createdAt.toISOString().slice(0, 10)} · {last.pagesCrawled} pages</p><p className="mt-1 font-mono text-4xl">{last.score ?? '—'}<span className="text-base text-[var(--color-muted)]">/100</span></p></Card>
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Top open findings</h2>
      <Table head={['Issue', 'Page', 'Severity']} rows={last.findings.map((f) => [f.message, <span key="p" className="block max-w-xs truncate">{f.pageUrl}</span>, f.severity])} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Keyword ideas</h2>
      <Table head={['Keyword', 'Source', 'Impressions', 'Clicks']} empty="No keyword data yet." rows={keywords.map((k) => [k.keyword, <Pill key="s" tone={k.source === 'MEASURED' ? 'success' : 'neutral'}>{k.source.toLowerCase()}</Pill>, k.impressions ?? '—', k.clicks ?? '—'])} />
    </>
  );
}
