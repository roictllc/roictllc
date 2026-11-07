import { ButtonLink, Card, PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';

export const metadata = { title: 'My website' };

export default async function MyWebsite() {
  const { data } = await requireCustomer();
  const [sites, domains, leads] = await Promise.all([
    data.website.findMany({ where: { archivedAt: null }, include: { deployments: { orderBy: { startedAt: 'desc' }, take: 5 }, uptime: { orderBy: { checkedAt: 'desc' }, take: 1 } } }),
    data.domain.findMany({}),
    data.website.findMany({ select: { leads: { orderBy: { createdAt: 'desc' }, take: 20 } } }),
  ]);
  const allLeads = leads.flatMap((l) => l.leads);
  if (sites.length === 0) {
    return (
      <>
        <PageHeader title="My website" />
        <Card glow className="text-center"><p className="font-display text-xl font-semibold">You don’t have an ROI website yet</p><p className="mx-auto mt-2 max-w-lg text-[var(--color-muted)]">Get a fast, professional site with hosting, SSL, a lead inbox and version history. Domains under $15/year are included.</p><div className="mt-5"><ButtonLink href="/dashboard/create/landing-page-hosting">See website plans</ButtonLink></div></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="My website" intro="Live status, domain, SSL, uptime, deployments and leads." />
      {sites.map((s) => (
        <Card key={s.id} className="mb-6">
          <div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">{s.name}</h2><span className="flex items-center gap-3"><Pill tone={statusTone(s.status)}>{s.status}</Pill><ButtonLink href={`/dashboard/website/${s.id}`} size="sm" variant="secondary">Manage →</ButtonLink></span></div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{s.liveUrl ?? s.previewUrl ?? 'Not published yet'}{s.uptime[0] ? ` · last check ${s.uptime[0].ok ? 'up' : 'DOWN'} (${s.uptime[0].latencyMs} ms)` : ''}</p>
          <Table head={['Deployment', 'Status', 'Started', 'URL']} empty="No deployments yet." rows={s.deployments.map((d) => [d.provider, <Pill key="s" tone={statusTone(d.status)}>{d.status}</Pill>, d.startedAt.toISOString().slice(0, 16).replace('T', ' '), d.url ?? '—'])} />
        </Card>
      ))}
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Domains</h2>
      <Table head={['Domain', 'Status', 'Paid by', 'Renews']} empty="No domains yet." rows={domains.map((d) => [d.name, <Pill key="s" tone={statusTone(d.status)}>{d.status}</Pill>, d.coveredByRoi ? 'ROI (under $15/yr)' : 'You', d.expiresAt?.toISOString().slice(0, 10) ?? '—'])} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Leads inbox</h2>
      <Table head={['Received', 'Name', 'Contact', 'Message']} empty="No leads yet." rows={allLeads.map((l) => [l.createdAt.toISOString().slice(0, 16).replace('T', ' '), l.name, [l.email, l.phone].filter(Boolean).join(' · '), <span key="m" className="block max-w-md truncate">{l.message}</span>])} />
    </>
  );
}
