import { PERMISSIONS } from '@roi/shared-types';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, Field, Input, PageHeader, Pill, Select, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { createStaffAction, setUserRoleAction, setUserStatusAction, togglePermissionAction } from '@/server/actions/admin';

export const metadata = { title: 'Users & roles' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'users.manage');
  const { q } = await searchParams;
  const users = await db().user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {},
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  const grants = await db().rolePermission.findMany();
  const has = (role: string, key: string) => grants.some((g) => g.roleName === role && g.permissionKey === key);
  return (
    <>
      <PageHeader title="Users & roles" intro="Staff accounts must change their temporary password and enroll two-factor authentication at first sign-in. Role changes sign the user out everywhere." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Search by email or name" aria-label="Search users" /><button className="rounded-full border border-[var(--color-border)] px-4 text-sm">Search</button></form>
          <Table head={['User', 'Role', 'Status', '2FA', 'Last sign-in', 'Actions']}
            rows={users.map((u) => [
              <div key="u"><p className="font-semibold">{u.name ?? '—'}</p><p className="text-xs text-[var(--color-muted)]">{u.email}</p></div>,
              <Pill key="r" tone={u.role === 'ADMIN' ? 'violet' : 'info'}>{u.role}</Pill>,
              <Pill key="s" tone={statusTone(u.status)}>{u.status}</Pill>,
              u.twoFactorEnabled ? '✓' : '—',
              u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 10) : 'never',
              u.id === user.id ? <span key="a" className="text-xs text-[var(--color-muted)]">you</span> : (
                <div key="a" className="flex flex-wrap gap-2">
                  <ActionForm action={setUserRoleAction} className="flex gap-1">
                    <CsrfField /><input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`} className="rounded-lg border border-[var(--color-border)] bg-black/30 px-2 py-1 text-xs">
                      {['ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE'].map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <button className="rounded-lg border border-[var(--color-border)] px-2 text-xs">Set</button>
                  </ActionForm>
                  <ActionForm action={setUserStatusAction}>
                    <CsrfField /><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="status" value={u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'} />
                    <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs">{u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
                  </ActionForm>
                </div>
              ),
            ])} />
        </section>
        <Card>
          <h2 className="font-display text-lg font-semibold">Add a staff member</h2>
          <ActionForm action={createStaffAction} className="mt-4 space-y-4">
            <CsrfField />
            <Field label="Name" name="name"><Input name="name" required /></Field>
            <Field label="Email" name="email"><Input name="email" type="email" required /></Field>
            <Field label="Role" name="role"><Select name="role" defaultValue="MANAGER"><option value="MANAGER">Manager (assigned customers)</option><option value="PM">Project manager</option><option value="ADMIN">Admin</option><option value="AFFILIATE">Affiliate</option></Select></Field>
            <SubmitButton>Create account</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="mb-1 font-display text-lg font-semibold">Permission matrix</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">Enforced on the server for every request. ADMIN always has every permission. Click to grant or revoke for other roles.</p>
        <Table head={['Permission', 'ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE']}
          rows={Object.entries(PERMISSIONS).map(([key, p]) => [
            <div key="k"><code className="font-mono text-xs text-[var(--color-primary)]">{key}</code><p className="text-xs text-[var(--color-muted)]">{p.description}</p></div>,
            ...(['ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE'] as const).map((role) =>
              role === 'ADMIN' ? <span key={role}>{has(role, key) ? '✓' : '—'}</span> : (
                <ActionForm key={role} action={togglePermissionAction}>
                  <CsrfField /><input type="hidden" name="role" value={role} /><input type="hidden" name="permission" value={key} />
                  <button aria-label={`${has(role, key) ? 'Revoke' : 'Grant'} ${key} for ${role}`} className={`grid size-7 place-items-center rounded-lg border text-xs ${has(role, key) ? 'border-[rgb(0_245_160/0.5)] bg-[rgb(0_245_160/0.12)] text-[var(--color-success)]' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}>{has(role, key) ? '✓' : '·'}</button>
                </ActionForm>
              )),
          ])} />
      </section>
    </>
  );
}
