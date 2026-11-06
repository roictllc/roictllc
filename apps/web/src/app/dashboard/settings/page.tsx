import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { ButtonLink, Card, Field, Input, PageHeader, Table, Textarea } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { requestDeletionAction, revokeSessionAction, updateProfileAction } from '@/server/actions/customer';

export const metadata = { title: 'Business & privacy' };

export default async function Settings() {
  const { user, workspace, session } = await requireCustomer();
  const p = workspace.profile;
  const sessions = await db().userSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } });
  return (
    <>
      <PageHeader title="Business & privacy" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">Business identity</h2>
          <ActionForm action={updateProfileAction} className="mt-4 space-y-4">
            <CsrfField />
            <Field label="Business name" name="displayName"><Input name="displayName" defaultValue={p?.displayName ?? workspace.name} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Industry" name="industry"><Input name="industry" defaultValue={p?.industry ?? ''} /></Field><Field label="Phone" name="phone"><Input name="phone" defaultValue={p?.phone ?? ''} /></Field></div>
            <Field label="Website" name="website"><Input name="website" defaultValue={p?.website ?? ''} /></Field>
            <Field label="Description" name="description"><Textarea name="description" defaultValue={p?.description ?? ''} /></Field>
            <Field label="Street address" name="addressLine1"><Input name="addressLine1" defaultValue={p?.addressLine1 ?? ''} /></Field>
            <div className="grid gap-4 sm:grid-cols-3"><Field label="City" name="city"><Input name="city" defaultValue={p?.city ?? ''} /></Field><Field label="State" name="state"><Input name="state" maxLength={2} defaultValue={p?.state ?? ''} /></Field><Field label="ZIP" name="postalCode"><Input name="postalCode" defaultValue={p?.postalCode ?? ''} /></Field></div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-lg font-semibold">Security</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Signed in as {user.email}. Two-factor: {user.twoFactorEnabled ? 'on' : 'off'}.</p>
            <div className="mt-4 flex flex-wrap gap-3"><ButtonLink href="/account/change-password" size="sm" variant="secondary">Change password</ButtonLink><ButtonLink href="/account/two-factor" size="sm" variant="secondary">{user.twoFactorEnabled ? 'Two-factor settings' : 'Turn on two-factor'}</ButtonLink></div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Signed-in devices</h3>
            <Table head={['Device', 'IP', 'Last active', '']} rows={sessions.map((s) => [<span key="u" className="block max-w-[220px] truncate text-xs">{s.userAgent ?? 'Unknown'}</span>, s.ip ?? '—', s.lastSeenAt.toISOString().slice(0, 16).replace('T', ' '), s.id === session.id ? <span key="c" className="text-xs text-[var(--color-success)]">this device</span> : <ActionForm key="r" action={revokeSessionAction}><CsrfField /><input type="hidden" name="sessionId" value={s.id} /><button className="text-xs text-[var(--color-danger)]">Sign out</button></ActionForm>])} />
          </Card>
          <Card>
            <h2 className="font-display text-lg font-semibold">Your data</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Download everything we hold about your business, or ask us to delete it (CCPA/CPRA).</p>
            <a href="/api/account/export" className="mt-4 inline-block rounded-full border border-[var(--color-border)] px-4 py-2 text-sm hover:border-[var(--color-primary)]">Download my data (JSON)</a>
            <ActionForm action={requestDeletionAction} className="mt-6 space-y-3"><CsrfField /><Field label="Type DELETE to request deletion" name="confirm"><Input name="confirm" /></Field><SubmitButton variant="danger" size="sm">Request deletion</SubmitButton></ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
