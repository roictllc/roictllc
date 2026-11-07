import { CsrfField } from '@/components/csrf-field';
import { PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { accessibleWorkspaceIds, can } from '@/server/authz';
import { retryJobAction } from '@/server/actions/admin';

export const metadata = { title: 'Jobs monitor' };

export default async function JobsPage() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const ws = await accessibleWorkspaceIds(user);
  const manage = await can(user, 'jobs.manage');
  const where = ws === null ? {} : { workspaceId: { in: ws } };
  const [jobs, byStatus, heartbeats] = await Promise.all([
    db().automationJob.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    db().automationJob.groupBy({ by: ['status'], where, _count: true }),
    db().workerHeartbeat.findMany({ orderBy: { lastBeatAt: 'desc' }, take: 5 }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Jobs monitor" intro="PostgreSQL queue (FOR UPDATE SKIP LOCKED) with leases, heartbeats, retries with backoff and a dead-letter state." />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Pending" value={count('PENDING')} />
        <Stat label="Processing" value={count('PROCESSING')} />
        <Stat label="Awaiting approval" value={count('WAITING_FOR_APPROVAL')} tone="warning" />
        <Stat label="Failed / dead" value={count('FAILED') + count('DEAD')} tone={count('FAILED') + count('DEAD') ? 'danger' : 'info'} />
        <Stat label="Workers online" value={heartbeats.filter((h) => Date.now() - h.lastBeatAt.getTime() < 120_000).length} tone="success" hint={heartbeats[0] ? `${heartbeats[0].workerId} v${heartbeats[0].version}` : 'No worker has connected yet (needs the VPS)'} />
      </div>
      <Table head={['Job', 'Type', 'Status', 'Attempts', 'Run at', 'Cost', 'Last error', '']} empty="No jobs yet."
        rows={jobs.map((j) => [
          <span key="i" className="font-mono text-xs">{j.id.slice(-10)}</span>, j.type, <Pill key="s" tone={statusTone(j.status)}>{j.status.replace(/_/g, ' ')}</Pill>, `${j.attempts}/${j.maxAttempts}`,
          j.runAt.toISOString().slice(0, 16).replace('T', ' '), `$${(j.costMillicents / 100000).toFixed(4)}`, <span key="e" className="block max-w-xs truncate text-xs text-[var(--color-danger)]">{j.lastError ?? ''}</span>,
          manage && ['FAILED', 'DEAD', 'PENDING', 'WAITING_FOR_APPROVAL'].includes(j.status) ? (
            <div key="a" className="flex gap-1">
              {j.status === 'WAITING_FOR_APPROVAL' && j.orderItemId && <form action={retryJobAction}><CsrfField /><input type="hidden" name="jobId" value={j.id} /><input type="hidden" name="op" value="approve" /><button className="rounded-lg border border-[var(--color-success)] px-2 py-1 text-xs text-[var(--color-success)]">Approve &amp; deliver</button></form>}
              {['FAILED', 'DEAD'].includes(j.status) && <form action={retryJobAction}><CsrfField /><input type="hidden" name="jobId" value={j.id} /><input type="hidden" name="op" value="retry" /><button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">Retry</button></form>}
              <form action={retryJobAction}><CsrfField /><input type="hidden" name="jobId" value={j.id} /><input type="hidden" name="op" value="cancel" /><button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">Cancel</button></form>
            </div>
          ) : '',
        ])} />
    </>
  );
}
