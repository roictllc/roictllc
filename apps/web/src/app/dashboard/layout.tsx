import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireCustomer } from '@/server/customer';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s · ROI' }, robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = await requireCustomer();
  return (
    <AppShell user={user} area="Workspace" groups={[
      { items: [{ href: '/dashboard', label: 'Overview' }] },
      { title: 'Grow', items: [{ href: '/dashboard/ai-visibility', label: 'AI Visibility' }, { href: '/dashboard/seo', label: 'SEO & local' }] },
      { title: 'Build', items: [{ href: '/dashboard/website', label: 'My website' }, { href: '/dashboard/products', label: 'Products & downloads' }, { href: '/dashboard/orders', label: 'Orders' }] },
      { title: 'Account', items: [{ href: '/dashboard/assistant', label: 'ROI assistant' }, { href: '/dashboard/billing', label: 'Billing' }, { href: '/dashboard/support', label: 'Support' }, { href: '/dashboard/settings', label: 'Business & privacy' }] },
    ]}>
      {children}
    </AppShell>
  );
}
