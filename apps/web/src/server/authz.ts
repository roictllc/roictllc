import 'server-only';
import { cache } from 'react';
import type { RoleName } from '@roi/shared-types';
import { db } from './db';

/**
 * Authorization in the service layer (spec §6). Grants come from role_permissions (ADMIN-configurable).
 * MANAGER access to customer data is limited to assigned workspaces.
 */
export class ForbiddenError extends Error {
  constructor(public permission: string) {
    super(`FORBIDDEN:${permission}`);
  }
}

export const grantsFor = cache(async (role: RoleName): Promise<Set<string>> => {
  const rows = await db().rolePermission.findMany({ where: { roleName: role }, select: { permissionKey: true } });
  return new Set(rows.map((r) => r.permissionKey));
});

export async function can(user: { role: RoleName }, permission: string) {
  return (await grantsFor(user.role)).has(permission);
}

export async function assertCan(user: { role: RoleName }, permission: string) {
  if (!(await can(user, permission))) throw new ForbiddenError(permission);
}

/** Workspaces a staff user may access; `null` = all. Customers get their own workspace only. */
export const accessibleWorkspaceIds = cache(async (user: { id: string; role: RoleName }): Promise<string[] | null> => {
  if (user.role === 'ADMIN' || user.role === 'PM') return null;
  if (user.role === 'MANAGER') {
    const rows = await db().managerAssignment.findMany({ where: { managerId: user.id }, select: { workspaceId: true } });
    return rows.map((r) => r.workspaceId);
  }
  if (user.role === 'CUSTOMER') {
    const c = await db().customer.findUnique({ where: { userId: user.id }, select: { workspaceId: true } });
    return c ? [c.workspaceId] : [];
  }
  return [];
});

export async function assertWorkspaceAccess(user: { id: string; role: RoleName }, workspaceId: string) {
  const ids = await accessibleWorkspaceIds(user);
  if (ids !== null && !ids.includes(workspaceId)) throw new ForbiddenError('workspace');
}

export async function customerWorkspaceId(userId: string) {
  const c = await db().customer.findUnique({ where: { userId }, select: { workspaceId: true } });
  return c?.workspaceId ?? null;
}
