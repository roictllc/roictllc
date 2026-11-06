import { PageHeader, Stat, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Assistant knowledge' };

export default async function AssistantAdmin() {
  await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const [docs, chunks, convs, recent] = await Promise.all([
    db().knowledgeDocument.findMany({ orderBy: { title: 'asc' }, include: { source: { select: { name: true, workspaceId: true } }, _count: { select: { chunks: true } } } }),
    db().knowledgeChunk.count(), db().assistantConversation.count(),
    db().assistantMessage.findMany({ where: { role: 'user' }, orderBy: { createdAt: 'desc' }, take: 15 }),
  ]);
  return (
    <>
      <PageHeader title="Assistant knowledge" intro="The built-in ROI assistant answers only from these documents (plus read-only, permission-scoped account lookups). No external AI API is called." />
      <div className="mb-8 grid gap-4 sm:grid-cols-3"><Stat label="Documents" value={docs.length} /><Stat label="Chunks indexed" value={chunks} /><Stat label="Conversations" value={convs} tone="violet" /></div>
      <h2 className="mb-3 font-display text-lg font-semibold">Knowledge documents</h2>
      <Table head={['Title', 'Source', 'Scope', 'Chunks', 'Link']} rows={docs.map((d) => [d.title, d.source.name, d.source.workspaceId ? 'client' : 'ROI global', d._count.chunks, d.url ?? '—'])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Latest questions asked</h2>
      <Table head={['When', 'Question']} empty="No questions yet." rows={recent.map((m) => [m.createdAt.toISOString().slice(0, 16).replace('T', ' '), m.content])} />
    </>
  );
}
