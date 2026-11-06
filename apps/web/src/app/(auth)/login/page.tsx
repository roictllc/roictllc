import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Field, Input } from '@/components/ui';
import { loginAction } from '@/server/actions/auth';
import { getSession, homeFor } from '@/server/session';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (s && s.session.twoFactorVerifiedAt) redirect(homeFor(s.user.role));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Sign in to ROI</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Welcome back. Your whole business, one dashboard.</p>
      <div className="mt-6 space-y-3">
        {sp.reset && <Alert tone="success">Your password was changed. Sign in with the new one.</Alert>}
        {sp.signedOut && <Alert tone="info">You are signed out.</Alert>}
      </div>
      <ActionForm action={loginAction} className="mt-6 space-y-5">
        <CsrfField />
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field label="Email" name="email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" name="password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-[var(--color-primary)] hover:underline">Forgot password?</Link>
        </div>
        <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">New to ROI? <Link href="/register" className="font-semibold text-[var(--color-primary)] hover:underline">Create an account</Link></p>
    </>
  );
}
