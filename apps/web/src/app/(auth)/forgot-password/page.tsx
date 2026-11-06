import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Field, Input } from '@/components/ui';
import { forgotPasswordAction } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">We’ll email you a link that works once and expires in 30 minutes.</p>
      <ActionForm action={forgotPasswordAction} className="mt-6 space-y-5">
        <CsrfField />
        <Field label="Email" name="email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <SubmitButton className="w-full" pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-[var(--color-primary)] hover:underline">Back to sign in</Link></p>
    </>
  );
}
