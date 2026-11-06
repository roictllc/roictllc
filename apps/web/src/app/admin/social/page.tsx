import { PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds } from '@/server/authz';

export const metadata = { title: 'Social' };

export default async function SocialAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const where = ws === null ? {} : { workspaceId: { in: ws } };
  const [accounts, queue, failed, plans, integrations] = await Promise.all([
    db().socialAccount.findMany({ where, include: { workspace: { select: { name: true } } }, take: 200 }),
    db().socialPost.findMany({ where: { ...where, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING'] } }, orderBy: { scheduledFor: 'asc' }, take: 50, include: { socialAccount: { select: { platform: true, handle: true } } } }),
    db().socialPost.count({ where: { ...where, status: 'FAILED' } }),
    db().socialPlan.findMany({ orderBy: { priceCents: 'asc' } }),
    db().integration.findMany({ where: { key: { in: ['meta', 'tiktok', 'x'] } } }),
  ]);
  return (
    <>
      <PageHeader title="Social" intro="Connected accounts, the posting queue, failures, and platform readiness. Each platform stays hidden from customers until its credentials and approvals pass a live check." />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Connected accounts" value={accounts.length} />
        <Stat label="Queued posts" value={queue.length} />
        <Stat label="Failed posts" value={failed} tone={failed ? 'danger' : 'info'} />
        <Stat label="Platforms ready" value={`${integrations.filter((i) => i.status === 'CONNECTED').length}/3`} hint="Meta (FB+IG), TikTok, X" tone="warning" />
      </div>
      <h2 className="mb-3 font-display text-lg font-semibold">Plans (draft until published)</h2>
      <Table head={['Plan', 'Price', 'Posts / month', 'Platforms', 'Published']} rows={plans.map((p) => [p.name, `$${(p.priceCents / 100).toFixed(2)}/mo`, p.postsPerMonth, p.platforms.join(', '), p.published ? <Pill key="p" tone="success">published</Pill> : <Pill key="p" tone="warning">draft</Pill>])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Accounts</h2>
      <Table head={['Business', 'Platform', 'Handle', 'Mode', 'Autopilot', 'Status']} empty="No social accounts connected yet."
        rows={accounts.map((a) => [a.workspace.name, a.platform, a.handle, a.postingMode.replace('_', ' '), a.autopilot ? `on since ${a.autopilotConsentAt?.toISOString().slice(0, 10)}` : 'off', <Pill key="s" tone={statusTone(a.paused ? 'SUSPENDED' : a.status)}>{a.paused ? 'paused' : a.status}</Pill>])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Queue</h2>
      <Table head={['Scheduled', 'Platform', 'Account', 'Status', 'Caption']} empty="Nothing queued."
        rows={queue.map((p) => [p.scheduledFor?.toISOString().slice(0, 16).replace('T', ' ') ?? '—', p.socialAccount.platform, p.socialAccount.handle, <Pill key="s" tone={statusTone(p.status)}>{p.status}</Pill>, <span key="c" className="block max-w-sm truncate text-sm">{p.caption}</span>])} />
    </>
  );
}
