import { PageHeader, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'audit.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = sp.action ? { action: { startsWith: sp.action } } : {};
  const [rows, total] = await Promise.all([db().auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, skip: (page - 1) * 50 }), db().auditLog.count({ where })]);
  return (
    <>
      <PageHeader title="Audit log" intro={`Append-only (the database rejects edits and deletes). ${total.toLocaleString('en-US')} events.`} />
      <form className="mb-4 flex gap-2"><input name="action" defaultValue={sp.action} placeholder="Filter by action prefix, e.g. price." aria-label="Filter" className="rounded-full border border-[var(--color-border)] bg-black/30 px-4 py-2 text-sm" /><button className="rounded-full border border-[var(--color-border)] px-4 text-sm">Filter</button></form>
      <Table head={['When (UTC)', 'Action', 'Actor', 'Target', 'IP', 'Details']}
        rows={rows.map((r) => [r.createdAt.toISOString().slice(0, 19).replace('T', ' '), <code key="a" className="font-mono text-xs text-[var(--color-primary)]">{r.action}</code>, `${r.actorRole ?? ''} ${r.actorId?.slice(-6) ?? 'system'}`, r.targetType ? `${r.targetType} ${r.targetId?.slice(-8) ?? ''}` : '—', r.ip ?? '—', <code key="d" className="block max-w-xs truncate font-mono text-[11px] text-[var(--color-muted)]">{r.data ? JSON.stringify(r.data) : ''}</code>])} />
      <div className="mt-4 flex gap-3 text-sm">
        {page > 1 && <a href={`?page=${page - 1}${sp.action ? `&action=${sp.action}` : ''}`} className="text-[var(--color-primary)]">← Newer</a>}
        {page * 50 < total && <a href={`?page=${page + 1}${sp.action ? `&action=${sp.action}` : ''}`} className="text-[var(--color-primary)]">Older →</a>}
      </div>
    </>
  );
}
