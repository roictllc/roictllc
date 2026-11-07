import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui';
import { WebsiteForm } from '@/components/website-form';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { getFlag } from '@/server/catalog';
import { storageFromEnv } from '@roi/product-engine/storage';

export const metadata: Metadata = { title: 'Build your website' };

export default async function BuildWebsitePage() {
  const c = await requireCustomer();
  const product = await db().product.findUnique({ where: { slug: 'landing-page-hosting' }, select: { visibility: true } });
  const open = product?.visibility === 'LIVE' || (await getFlag('previews')) === 'LIVE';
  const existing = await c.data.website.findFirst({ where: { archivedAt: null } });
  return (
    <>
      <PageHeader title="Build your website" intro="Fill in your business details and see your site in seconds. Edit as often as you like; publish when you subscribe." actions={<Link href="/products/landing-page-hosting" className="text-sm text-[var(--color-primary)]">Product details →</Link>} />
      {existing && <div className="mb-6"><Alert tone="info" title="You already have a site">Manage “{existing.name}” in <Link href={`/dashboard/website/${existing.id}`} className="underline">My website</Link>, or build another one below.</Alert></div>}
      {!open ? <Alert tone="info" title="Coming soon">Website building opens at launch.</Alert>
        : !storageFromEnv() ? <Alert tone="info" title="Coming soon">Website building opens as soon as file storage is connected.</Alert>
        : <Card><WebsiteForm submitLabel="Build my website (free preview)" d={{ businessName: c.workspace.name, email: c.user.email, city: c.workspace.profile?.city ?? undefined, state: c.workspace.profile?.state ?? undefined, phone: c.workspace.profile?.phone ?? undefined }} /></Card>}
    </>
  );
}
