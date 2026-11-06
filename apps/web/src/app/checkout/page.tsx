import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Brand, Card, Container } from '@/components/ui';
import { db } from '@/server/db';
import { getSetting } from '@/server/catalog';
import { requireCustomer } from '@/server/customer';
import { checkoutAction } from '@/server/actions/checkout';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  await requireCustomer();
  const { plan: planId } = await searchParams;
  if (!planId) redirect('/products');
  const plan = await db().productPlan.findUnique({ where: { id: planId }, include: { product: true, features: true, prices: { where: { activeTo: null }, orderBy: { version: 'desc' }, take: 1 } } });
  if (!plan) redirect('/products');
  const price = plan.prices[0];
  const consent = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
  return (
    <main id="main" className="min-h-dvh py-10">
      <Container className="max-w-xl">
        <Brand />
        <Card className="mt-8" glow>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Order summary</p>
          <h1 className="mt-2 font-display text-2xl font-bold">{plan.product.name} — {plan.name}</h1>
          <ul className="mt-4 space-y-1 text-sm text-[var(--color-muted)]">{plan.features.map((f) => <li key={f.id}>✓ {f.text}</li>)}</ul>
          <p className="mt-6 flex items-baseline justify-between border-t border-[var(--color-border)] pt-4"><span>Total today (before tax)</span><span className="font-mono text-2xl">{price ? formatUsd(price.amountCents) : '—'}{price?.interval === 'MONTH' ? '/mo' : price?.interval === 'YEAR' ? '/yr' : ''}</span></p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Sales tax is calculated by Stripe Tax where it applies. Prices are verified on our server at payment time.</p>
          <ActionForm action={checkoutAction} className="mt-6 space-y-4">
            <CsrfField />
            <input type="hidden" name="planId" value={plan.id} />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-4" /><span>{consent} <a href="/legal/terms" className="text-[var(--color-primary)]">Terms</a> · <a href="/legal/refund-policy" className="text-[var(--color-primary)]">Refund Policy</a></span></label>
            <SubmitButton className="w-full" size="lg" pendingText="Opening secure checkout…">Pay securely with Stripe</SubmitButton>
          </ActionForm>
          {plan.product.visibility !== 'LIVE' && <div className="mt-4"><Alert tone="info">This product is not on sale yet.</Alert></div>}
        </Card>
      </Container>
    </main>
  );
}
