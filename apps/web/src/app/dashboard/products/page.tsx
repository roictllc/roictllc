import { Alert, PageHeader, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';

export const metadata = { title: 'Products & downloads' };

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function Downloads() {
  const { data } = await requireCustomer();
  const files = await data.generatedDeliverable.findMany({ where: { isPreview: false }, orderBy: { createdAt: 'desc' } });
  const r2 = await db().integration.findUnique({ where: { key: 'r2' } });
  return (
    <>
      <PageHeader title="Products & downloads" intro="Files appear here after they pass quality checks. Links are private to your account and expire after a few minutes for safety." />
      {r2?.status !== 'CONNECTED' && <div className="mb-6"><Alert tone="info">File delivery opens when ROI’s secure file storage goes live.</Alert></div>}
      <Table head={['File', 'Type', 'Size', 'Details', 'Delivered', '']} empty="No files yet."
        rows={files.map((f) => [f.fileName, f.kind, size(f.sizeBytes), [f.width && f.height ? `${f.width}×${f.height}` : null, f.durationMs ? `${(f.durationMs / 1000).toFixed(1)} s` : null].filter(Boolean).join(' · ') || '—', f.createdAt.toISOString().slice(0, 10), <a key="d" href={`/api/files/${f.id}`} className="text-sm font-semibold text-[var(--color-primary)]">Download</a>])} />
    </>
  );
}
