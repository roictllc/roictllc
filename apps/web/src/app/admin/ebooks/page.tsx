import { formatUsd } from '@roi/shared-utils';
import { Alert, PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'E-books' };

export default async function EbooksAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  await assertCan(user, 'ebooks.manage');
  const books = await db().eBook.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, include: { category: true, _count: { select: { purchases: true } } } });
  const r2 = await db().integration.findUnique({ where: { key: 'r2' } });
  return (
    <>
      <PageHeader title="E-books" intro="Full book files are visible only to admins, PMs and managers (every access is audited). Customers see the catalog and a 3-page preview of Chapter 1." />
      {r2?.status !== 'CONNECTED' && <div className="mb-6"><Alert tone="warning" title="Uploads need file storage">Connect Cloudflare R2 in Integrations to upload book files. Each upload requires a rights attestation.</Alert></div>}
      <Table head={['Title', 'Author', 'Category', 'Price', 'Pages', 'Chapter 1 starts', 'Sales', 'Status']} empty="No books yet."
        rows={books.map((b) => [b.title, b.author, b.category.name, formatUsd(b.priceCents), b.pageCount ?? '—', b.chapter1StartPage, b._count.purchases, <Pill key="s" tone={statusTone(b.status)}>{b.status}</Pill>])} />
    </>
  );
}
