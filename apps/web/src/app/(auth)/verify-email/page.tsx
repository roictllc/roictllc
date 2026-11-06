import type { Metadata } from 'next';
import { Alert, ButtonLink } from '@/components/ui';
import { verifyEmailToken } from '@/server/auth-service';

export const metadata: Metadata = { title: 'Verify email', robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Email verification</h1>
      {ok ? <Alert tone="success">Your email is confirmed. Thank you!</Alert> : <Alert tone="danger">This link is invalid or has expired. Sign in and request a new one from Settings.</Alert>}
      <ButtonLink href="/dashboard" className="w-full">Go to dashboard</ButtonLink>
    </div>
  );
}
