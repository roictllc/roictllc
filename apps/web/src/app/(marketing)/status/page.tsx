import type { Metadata } from 'next';
import { Card, Container, Pill, SectionHeading } from '@/components/ui';
import { componentHealth } from '@/server/health';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({ title: 'System status', description: 'Live health of ROI’s website, API, database, job queue and media worker.', path: '/status' });
export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const h = await componentHealth();
  const tone = (s: string) => (s === 'operational' ? 'success' : s === 'degraded' || s === 'not deployed' ? 'warning' : 'danger');
  return (
    <Container className="py-16">
      <SectionHeading eyebrow="Status" title={h.overall === 'operational' ? 'All core systems operational' : 'Some components need attention'} intro={`Checked ${new Date(h.checkedAt).toUTCString()}. This page reads real component health; nothing is hard-coded.`} />
      <Card className="mt-10 p-0">
        <ul className="divide-y divide-[var(--color-border)]/50">
          {h.components.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-4 px-6 py-4">
              <div><p className="font-semibold">{c.name}</p><p className="text-sm text-[var(--color-muted)]">{c.detail}</p></div>
              <Pill tone={tone(c.status)}>{c.status}</Pill>
            </li>
          ))}
        </ul>
      </Card>
    </Container>
  );
}
