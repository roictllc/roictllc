import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Field, Input } from '@/components/ui';
import { resetPasswordAction } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  if (!token) return <Alert tone="danger" title="Missing link">Open the link from your email again.</Alert>;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
      <ActionForm action={resetPasswordAction} className="mt-6 space-y-5">
        <CsrfField />
        <input type="hidden" name="token" value={token} />
        <Field label="New password" name="password" hint="At least 12 characters."><Input name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
        <Field label="Confirm new password" name="confirm"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
        <SubmitButton className="w-full">Save password</SubmitButton>
      </ActionForm>
    </>
  );
}
