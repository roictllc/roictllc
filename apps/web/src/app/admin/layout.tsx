import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell, type NavGroup } from '@/components/app-shell';
import { requireUser } from '@/server/session';
import { grantsFor } from '@/server/authz';
import { db } from '@/server/db';

export const metadata: Metadata = { title: { default: 'Control Center', template: '%s · ROI Control Center' }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  const g = await grantsFor(user.role);
  const awaiting = await db().integration.count({ where: { status: { not: 'CONNECTED' } } });
  const has = (p: string) => g.has(p);
  const groups: NavGroup[] = [
    { items: [{ href: '/admin', label: 'Overview' }] },
    {
      title: 'Business', items: [
        has('finance.view') || has('finance.revenue_by_product') ? { href: '/admin/finance', label: 'Finance' } : null,
        has('products.manage') ? { href: '/admin/products', label: 'Products & pricing' } : null,
        { href: '/admin/orders', label: 'Orders' },
        { href: '/admin/customers', label: 'Customers' },
        has('customers.view_all') ? { href: '/admin/subscriptions', label: 'Subscriptions' } : null,
      ].filter(Boolean) as NavGroup['items'],
    },
    {
      title: 'Operations', items: [
        { href: '/admin/jobs', label: 'Jobs monitor' },
        { href: '/admin/websites', label: 'Websites & domains' },
        { href: '/admin/social', label: 'Social' },
        { href: '/admin/ai-visibility', label: 'AI Visibility' },
        has('ebooks.manage') ? { href: '/admin/ebooks', label: 'E-books' } : null,
        { href: '/admin/support', label: 'Support' },
        has('moderation.manage') ? { href: '/admin/moderation', label: 'Moderation & takedowns' } : null,
      ].filter(Boolean) as NavGroup['items'],
    },
    {
      title: 'Growth', items: [
        has('email_marketing.manage') ? { href: '/admin/email', label: 'Email marketing' } : null,
        has('affiliates.manage') ? { href: '/admin/affiliates', label: 'Affiliates' } : null,
        { href: '/admin/assistant', label: 'Assistant knowledge' },
      ].filter(Boolean) as NavGroup['items'],
    },
    {
      title: 'Platform', items: [
        has('integrations.manage') ? { href: '/admin/integrations', label: 'Integrations', badge: awaiting ? String(awaiting) : undefined } : null,
        has('users.manage') ? { href: '/admin/users', label: 'Users & roles' } : null,
        has('flags.manage') ? { href: '/admin/flags', label: 'Feature flags' } : null,
        has('settings.manage') ? { href: '/admin/settings', label: 'Settings' } : null,
        has('audit.view') ? { href: '/admin/audit', label: 'Audit log' } : null,
      ].filter(Boolean) as NavGroup['items'],
    },
  ].filter((x) => x.items.length);
  return <AppShell groups={groups} user={user} area={user.role === 'ADMIN' ? 'Admin' : user.role === 'PM' ? 'PM' : 'Manager'}>{children}</AppShell>;
}
