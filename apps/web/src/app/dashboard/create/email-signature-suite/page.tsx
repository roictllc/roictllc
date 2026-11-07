import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { SIGNATURE_TEMPLATES } from '@roi/product-engine/signature-templates';
import { SignatureBuilder } from '@/components/signature-builder';
import { Alert, Card, PageHeader } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { csrfToken } from '@/server/csrf';
import { db } from '@/server/db';
import { getFlag, getPublicProduct, getSetting } from '@/server/catalog';
import { signatureAvailability } from '@/server/previews';
import { buySignaturesAction, previewSignaturesAction } from '@/server/actions/signatures';

export const metadata: Metadata = { title: 'Email signatures' };

export default async function SignatureSuitePage() {
  const c = await requireCustomer();
  const product = await getPublicProduct('email-signature-suite');
  if (!product) notFound();
  const [avail, csrf, checkout, max, gif] = await Promise.all([
    signatureAvailability(), csrfToken(), getFlag('checkout'), getSetting<number>('signatures.maxEmployees', 50),
    db().generatedDeliverable.findFirst({ where: { workspaceId: c.workspaceId, kind: 'email-gif', isPreview: false, publicUrl: { not: null } } }),
  ]);
  const plan = product.plans.find((p) => p.published && p.price) ?? null;
  return (
    <>
      <PageHeader title="Email Signature Suite" intro="Professional signatures for your whole team that work in Gmail, Outlook, Apple Mail and Thunderbird. Preview free; pay once for the clean suite." actions={<Link href="/products/email-signature-suite" className="text-sm text-[var(--color-primary)]">Product details →</Link>} />
      {!avail.ok ? (
        <Alert tone="info" title="Coming soon">{avail.reason}</Alert>
      ) : (
        <Card>
          <SignatureBuilder
            csrf={csrf}
            templates={SIGNATURE_TEMPLATES.map((t) => ({ slug: t.slug, name: t.name }))}
            defaults={{ companyName: c.workspace.name, website: c.workspace.profile?.website ?? undefined, email: c.user.email, ownerName: c.user.name ?? 'Your Name' }}
            hasAnimatedLogo={!!gif}
            checkoutOpen={checkout === 'LIVE' && product.visibility === 'LIVE'}
            price={plan?.price ? formatUsd(plan.price.amountCents) : '—'}
            maxEmployees={max}
            preview={previewSignaturesAction}
            buy={buySignaturesAction}
          />
        </Card>
      )}
    </>
  );
}
