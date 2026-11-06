import 'server-only';
import { redirect } from 'next/navigation';
import { scoped, db } from './db';
import { requireUser } from './session';
import { customerWorkspaceId } from './authz';

/** Resolve the signed-in customer's workspace; all customer data access goes through `scoped()` (spec §5.3). */
export async function requireCustomer() {
  const s = await requireUser({ roles: ['CUSTOMER'] });
  const workspaceId = await customerWorkspaceId(s.user.id);
  if (!workspaceId) redirect('/login');
  const workspace = await db().businessWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { profile: true } });
  return { ...s, workspaceId, workspace, data: scoped(workspaceId) };
}
