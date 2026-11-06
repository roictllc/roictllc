import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Field, Input } from '@/components/ui';
import { changePasswordAction } from '@/server/actions/auth';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Change password', robots: { index: false } };

export default async function ChangePasswordPage() {
  const { user } = await requireUser({ allowPending: true });
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Change your password</h1>
      {user.mustChangePassword && <div className="mt-4"><Alert tone="warning" title="Required before you continue">This account was created with a temporary password. Choose your own now.</Alert></div>}
      <ActionForm action={changePasswordAction} className="mt-6 space-y-5">
        <CsrfField />
        <Field label="Current password" name="current"><Input name="current" type="password" autoComplete="current-password" required /></Field>
        <Field label="New password" name="next" hint="At least 12 characters; different from the current one."><Input name="next" type="password" autoComplete="new-password" required minLength={12} /></Field>
        <Field label="Confirm new password" name="confirm"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
        <SubmitButton className="w-full">Save new password</SubmitButton>
      </ActionForm>
    </>
  );
}
