import Link from 'next/link';
import { formatUsd } from '@roi/shared-utils';
import { Alert, ButtonLink, Card, PageHeader, Pill, Stat, statusTone } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';

export const metadata = { title: 'Overview' };

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { user, workspace, workspaceId, data } = await requireCustomer();
  const sp = await searchParams;
  const [subs, orders, files, sites, social, audit, tickets] = await Promise.all([
    data.subscription.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, include: { price: { include: { plan: { include: { product: true } } } } } }),
    data.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { items: { include: { product: true } } } }),
    data.generatedDeliverable.count({ where: { isPreview: false } }),
    data.website.findMany({ where: { archivedAt: null }, take: 1 }),
    data.socialAccount.count(),
    db().aiVisibilityAudit.findFirst({ where: { workspaceId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } }),
    data.supportTicket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
  ]);
  return (
    <>
      <PageHeader title={`Welcome${sp.welcome ? '' : ' back'}, ${workspace.name}`} intro="Everything ROI builds and runs for your business, in one place." actions={<ButtonLink href="/products">Explore products</ButtonLink>} />
      {!user.emailVerifiedAt && <div className="mb-6"><Alert tone="warning" title="Confirm your email">We sent a confirmation link to {user.email}. Confirming lets us deliver your files.</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active subscriptions" value={subs.length} />
        <Stat label="Files delivered" value={files} tone="success" />
        <Stat label="AI visibility score" value={audit?.score ?? '—'} hint={audit ? `Checked ${audit.createdAt.toISOString().slice(0, 10)}` : 'Run your free audit'} tone="violet" />
        <Stat label="Open tickets" value={tickets} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Recent orders</h2>
          {orders.length === 0 ? <p className="mt-3 text-[var(--color-muted)]">No orders yet. Start with the free AI audit or browse products.</p> : (
            <ul className="mt-4 divide-y divide-[var(--color-border)]/50">
              {orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold">{o.items.map((i) => i.product.name).join(', ')}</p><p className="font-mono text-xs text-[var(--color-muted)]">{o.orderNumber} · {o.createdAt.toISOString().slice(0, 10)}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm">{formatUsd(o.totalCents)}</span><Pill tone={statusTone(o.status)}>{o.status.replace(/_/g, ' ')}</Pill></div></li>)}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card glow>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">AI Visibility</p>
            <p className="mt-2 font-display text-lg font-semibold">{audit ? `Your score: ${audit.score}/100` : 'How does ChatGPT see your business?'}</p>
            <div className="mt-4"><ButtonLink href={audit ? `/ai-visibility/report/${audit.shareToken}` : '/ai-visibility#audit'} size="sm">{audit ? 'Open report' : 'Run free audit'}</ButtonLink></div>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Social & website</p>
            <p className="mt-2 text-sm">{social ? `${social} social account(s) connected.` : 'No social accounts connected yet.'}</p>
            <p className="mt-1 text-sm">{sites[0] ? `Website “${sites[0].name}”: ${sites[0].status.toLowerCase()}` : 'No website yet.'}</p>
            <p className="mt-3 flex gap-3 text-sm"><Link href="/dashboard/social" className="text-[var(--color-primary)]">Command center →</Link><Link href="/dashboard/website" className="text-[var(--color-primary)]">Website →</Link></p>
          </Card>
        </div>
      </div>
      {subs.length > 0 && (
        <Card className="mt-6">
          <h2 className="font-display text-lg font-semibold">Subscriptions</h2>
          <ul className="mt-3 space-y-2 text-sm">{subs.map((s) => <li key={s.id} className="flex justify-between"><span>{s.price.plan.product.name} · {s.price.plan.name}</span><span className="font-mono">{formatUsd(s.price.amountCents)}/{s.price.interval === 'YEAR' ? 'yr' : 'mo'}{s.currentPeriodEnd ? ` · renews ${s.currentPeriodEnd.toISOString().slice(0, 10)}` : ''}</span></li>)}</ul>
        </Card>
      )}
    </>
  );
}
