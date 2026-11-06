export type RoleName = 'ADMIN' | 'PM' | 'MANAGER' | 'CUSTOMER' | 'AFFILIATE';
export const ROLES: RoleName[] = ['ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE'];
export const STAFF_ROLES: RoleName[] = ['ADMIN', 'PM', 'MANAGER'];

/**
 * Permission matrix (spec §6 Roles). Enforced in the service layer (apps/web/src/server/authz.ts);
 * UI hiding is cosmetic. Seeded into roles/permissions/role_permissions; ADMIN may change PM/MANAGER grants
 * at runtime (e.g. PM finance visibility) through /admin/users/roles.
 */
export const PERMISSIONS: Record<string, { description: string; roles: RoleName[] }> = {
  'finance.view': { description: 'Company finance: net profit, expenses, payouts, ledger', roles: ['ADMIN'] },
  'finance.revenue_by_product': { description: 'Revenue per product (no net profit/expenses)', roles: ['ADMIN', 'PM'] },
  'settings.manage': { description: 'Platform settings, legal text, thresholds', roles: ['ADMIN'] },
  'integrations.manage': { description: 'Integration credentials and status board', roles: ['ADMIN'] },
  'users.manage': { description: 'Users, roles and permissions', roles: ['ADMIN'] },
  'products.manage': { description: 'Products, plans, copy, visibility', roles: ['ADMIN'] },
  'prices.manage': { description: 'Price versions and margin-guard overrides', roles: ['ADMIN'] },
  'flags.manage': { description: 'Feature flags', roles: ['ADMIN'] },
  'audit.view': { description: 'Audit log viewer', roles: ['ADMIN'] },
  'impersonate': { description: 'Read-only customer preview', roles: ['ADMIN'] },
  'customers.view_all': { description: 'All customers', roles: ['ADMIN', 'PM'] },
  'customers.view_assigned': { description: 'Assigned customers only', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'orders.view_all': { description: 'All orders', roles: ['ADMIN', 'PM'] },
  'orders.view_assigned': { description: 'Orders of assigned customers', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'jobs.manage': { description: 'Retry/cancel/reassign any job', roles: ['ADMIN', 'PM'] },
  'jobs.view_assigned': { description: 'Jobs of assigned customers', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'deliverables.approve': { description: 'Upload/approve deliverables for assigned customers', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'ebooks.source': { description: 'Open/download full e-book source files (audited)', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'ebooks.manage': { description: 'Upload and edit e-books', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'tickets.manage_all': { description: 'All support tickets', roles: ['ADMIN', 'PM'] },
  'tickets.manage_assigned': { description: 'Tickets of assigned customers', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'moderation.manage': { description: 'Moderation queue and takedowns', roles: ['ADMIN', 'PM'] },
  'websites.manage_all': { description: 'All websites and deployments', roles: ['ADMIN', 'PM'] },
  'social.review': { description: 'Review social posts (manager review mode)', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'ai_visibility.manual_entry': { description: 'Enter manual AI-engine mention checks', roles: ['ADMIN', 'PM', 'MANAGER'] },
  'email_marketing.manage': { description: 'Campaigns, subscribers, templates', roles: ['ADMIN'] },
  'affiliates.manage': { description: 'Approve affiliates, commissions and payouts', roles: ['ADMIN'] },
  'workspace.own': { description: 'Own workspace (customers)', roles: ['CUSTOMER'] },
  'affiliate.own': { description: 'Own referrals and commissions', roles: ['AFFILIATE'] },
};

export function defaultGrants(role: RoleName): string[] {
  return Object.entries(PERMISSIONS)
    .filter(([, p]) => p.roles.includes(role))
    .map(([k]) => k);
}

export type VisibilityState = 'HIDDEN' | 'COMING_SOON' | 'LIVE';
