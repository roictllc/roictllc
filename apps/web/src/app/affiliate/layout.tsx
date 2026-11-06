import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Affiliate', robots: { index: false, follow: false } };

export default async function AffiliateLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser({ roles: ['AFFILIATE'] });
  return <AppShell user={user} area="Affiliate" groups={[{ items: [{ href: '/affiliate', label: 'Overview' }] }]}>{children}</AppShell>;
}
