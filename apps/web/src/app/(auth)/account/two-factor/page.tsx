import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { cookies } from 'next/headers';
import { decryptSecret, otpauthUrl } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, ButtonLink, Field, Input } from '@/components/ui';
import { RecoveryCodes } from '@/components/recovery-codes';
import { confirmTotpAction, startTotpAction, verifyTotpAction } from '@/server/actions/auth';
import { RC_COOKIE } from '@/lib/constants';
import { pendingTotpSecret } from '@/server/auth-service';
import { homeFor, requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Two-factor authentication', robots: { index: false } };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, session } = await requireUser({ allowPending: true });
  const staff = ['ADMIN', 'PM', 'MANAGER'].includes(user.role);

  if (user.twoFactorEnabled && !session.twoFactorVerifiedAt) {
    return (
      <>
        <h1 className="font-display text-2xl font-bold">Enter your 6-digit code</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Open your authenticator app. Lost your phone? Use one of your recovery codes.</p>
        <ActionForm action={verifyTotpAction} className="mt-6 space-y-5">
          <CsrfField />
          <input type="hidden" name="next" value={sp.next ?? ''} />
          <Field label="Code" name="code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={9} className="text-center font-mono text-2xl tracking-[0.4em]" /></Field>
          <SubmitButton className="w-full">Verify</SubmitButton>
        </ActionForm>
      </>
    );
  }

  if (user.twoFactorEnabled) {
    let codes: string[] | null = null;
    const rc = sp.done ? (await cookies()).get(RC_COOKIE)?.value : undefined;
    if (rc) {
      try {
        codes = JSON.parse(decryptSecret(rc, `rc:${user.id}`));
      } catch {
        codes = null;
      }
    }
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Two-factor authentication is on</h1>
        <Alert tone="success">Your account is protected with an authenticator app.</Alert>
        {codes ? <RecoveryCodes codes={codes} next={homeFor(user.role)} /> : <ButtonLink href={homeFor(user.role)} className="w-full">Continue</ButtonLink>}
      </div>
    );
  }

  const secret = sp.setup ? await pendingTotpSecret(user.id) : null;
  if (!secret) {
    return (
      <>
        <h1 className="font-display text-2xl font-bold">Protect your account</h1>
        {staff && <div className="mt-4"><Alert tone="warning" title="Required for staff accounts">Admins, project managers and managers must use two-factor authentication.</Alert></div>}
        <p className="mt-4 text-sm text-[var(--color-muted)]">You’ll need an authenticator app such as Google Authenticator, 1Password, Microsoft Authenticator or Authy.</p>
        <ActionForm action={startTotpAction} className="mt-6">
          <CsrfField />
          <SubmitButton className="w-full">Set up two-factor authentication</SubmitButton>
        </ActionForm>
      </>
    );
  }

  const svg = await QRCode.toString(otpauthUrl(secret, user.email), { type: 'svg', margin: 1, color: { dark: '#04050D', light: '#FFFFFF' } });
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Scan this code</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Scan with your authenticator app, then enter the 6-digit code it shows.</p>
      <div className="mx-auto mt-6 w-52 rounded-2xl bg-white p-3" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 text-center text-xs text-[var(--color-muted)]">Can’t scan? Enter this key: <code className="select-all break-all font-mono text-[var(--color-text)]">{secret}</code></p>
      <ActionForm action={confirmTotpAction} className="mt-6 space-y-5">
        <CsrfField />
        <Field label="6-digit code" name="code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} className="text-center font-mono text-2xl tracking-[0.4em]" /></Field>
        <SubmitButton className="w-full">Turn on two-factor</SubmitButton>
      </ActionForm>
    </>
  );
}
