import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Field, Input } from '@/components/ui';
import { registerAction } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Create your ROI workspace</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Free to create. You only pay for the products you choose.</p>
      <ActionForm action={registerAction} className="mt-6 space-y-5">
        <CsrfField />
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field label="Your name" name="name"><Input name="name" autoComplete="name" required minLength={2} /></Field>
        <Field label="Business name" name="businessName"><Input name="businessName" autoComplete="organization" required minLength={2} /></Field>
        <Field label="Work email" name="email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" name="password" hint="At least 12 characters. A short sentence works well."><Input name="password" type="password" autoComplete="new-password" required minLength={12} /></Field>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-[var(--color-primary)]" /><span>I agree to the <Link href="/legal/terms" className="text-[var(--color-primary)] hover:underline">Terms</Link> and <Link href="/legal/privacy" className="text-[var(--color-primary)] hover:underline">Privacy Policy</Link>.</span></label>
        <label className="flex items-start gap-3 text-sm text-[var(--color-muted)]"><input type="checkbox" name="marketingOk" className="mt-1 size-4 accent-[var(--color-primary)]" /><span>Send me occasional growth tips and product news. Unsubscribe anytime.</span></label>
        <SubmitButton className="w-full" pendingText="Creating workspace…">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">Already have an account? <Link href="/login" className="font-semibold text-[var(--color-primary)] hover:underline">Sign in</Link></p>
    </>
  );
}
