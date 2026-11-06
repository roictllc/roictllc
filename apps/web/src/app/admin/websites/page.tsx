import { formatUsd } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds, getDomainPolicy } from '@/server/domains-admin';

export const metadata = { title: 'Websites & domains' };

export default async function WebsitesAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const where = ws === null ? {} : { workspaceId: { in: ws } };
  const [sites, domains, policy] = await Promise.all([
    db().website.findMany({ where: { ...where, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, include: { workspace: { select: { name: true } }, uptime: { orderBy: { checkedAt: 'desc' }, take: 1 } } }),
    db().domain.findMany({ where, orderBy: { expiresAt: 'asc' }, take: 200, include: { workspace: { select: { name: true } } } }),
    getDomainPolicy(),
  ]);
  return (
    <>
      <PageHeader title="Websites & domains" intro={`Domain rule: ROI covers domains whose yearly price is under ${formatUsd(policy.thresholdCents, { showZeroCents: true })}; at or above it the customer pays in full at registration and every renewal.`} />
      <h2 className="mb-3 font-display text-lg font-semibold">Websites</h2>
      <Table head={['Site', 'Business', 'Industry', 'Status', 'URL', 'Uptime (last check)']} empty="No websites yet."
        rows={sites.map((s) => [s.name, s.workspace.name, s.industry, <Pill key="s" tone={statusTone(s.status)}>{s.status}</Pill>, s.liveUrl ?? s.previewUrl ?? '—', s.uptime[0] ? `${s.uptime[0].ok ? 'up' : 'DOWN'} · ${s.uptime[0].latencyMs ?? '?'} ms` : '—'])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Domains & renewal calendar</h2>
      <Table head={['Domain', 'Business', 'Status', 'Paid by', 'Expires', 'Auto-renew']} empty="No domains yet."
        rows={domains.map((d) => [<span key="n" className="font-mono">{d.name}</span>, d.workspace.name, <Pill key="s" tone={statusTone(d.status)}>{d.status}</Pill>, d.external ? 'customer (external)' : d.coveredByRoi ? 'ROI' : 'customer', d.expiresAt?.toISOString().slice(0, 10) ?? '—', d.autoRenew ? 'on' : 'off'])} />
    </>
  );
}
