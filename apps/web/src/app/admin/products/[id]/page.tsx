import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_COST_MODEL, formatUsd } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { PriceEditor } from '@/components/price-editor';
import { SubmitButton } from '@/components/submit-button';
import { Card, Field, Input, PageHeader, Pill, Select, statusTone, Table, Textarea } from '@/components/ui';
import { db } from '@/server/db';
import { csrfToken } from '@/server/csrf';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';
import { changePriceAction, setVisibilityAction, updateCostModelAction, updateProductCopyAction } from '@/server/actions/admin';

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  await assertCan(user, 'products.manage');
  const p = await db().product.findUnique({ where: { id }, include: { costModel: true, plans: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' }, include: { prices: { orderBy: { version: 'desc' } } } } } });
  if (!p) notFound();
  const integrations = await db().integration.findMany({ where: { key: { in: p.requiredIntegrations } } });
  const model = { ...DEFAULT_COST_MODEL, ...(p.costModel ?? {}) };
  const csrf = await csrfToken();
  const costFields: Array<[keyof typeof model, string, string]> = [
    ['computeSecondsExpected', 'Compute seconds per order', 'Worker time per job'], ['computeRateMillicentsPerS', 'Compute rate (millicents/s)', '1 millicent = $0.00001'],
    ['storageMillicents', 'Storage (millicents)', 'Per order/period'], ['emailMillicents', 'Email (millicents)', 'Per order/period'],
    ['domainCostCents', 'Domain cost (cents)', 'Average covered domain'], ['socialApiMillicentsPerPost', 'Social API per post (millicents)', 'X link post ≈ 20 000'],
    ['postsPerPeriod', 'Posts per period', 'Social plans'], ['supportAllowanceCents', 'Support allowance (cents)', 'Per order/period'],
    ['refundAllowanceBps', 'Refund allowance (bps)', '300 = 3%'], ['minMarginBps', 'Minimum margin (bps)', '4000 = 40%'],
  ];
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/products" className="text-[var(--color-primary)] hover:underline">← All products</Link></p>
      <PageHeader title={`${p.number}. ${p.name}`} intro={p.tagline} actions={<Link href={`/products/${p.slug}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm hover:border-[var(--color-primary)]">View public page ↗</Link>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Prices</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {p.plans.map((pl) => (
                <PriceEditor key={pl.id} planId={pl.id} planName={`${pl.name}${pl.published ? '' : ' (draft)'}`} currentCents={pl.prices[0]?.amountCents ?? null} interval={pl.prices[0]?.interval ?? (p.kind === 'SUBSCRIPTION' ? 'MONTH' : 'ONE_TIME')} model={model} csrf={csrf} action={changePriceAction} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Price history</h2>
            <Table head={['Plan', 'Version', 'Price', 'Margin', 'From', 'Until', 'Reason']}
              rows={p.plans.flatMap((pl) => pl.prices.map((pr) => [pl.name, `v${pr.version}`, <span key="a" className="font-mono">{formatUsd(pr.amountCents)}{pr.interval === 'MONTH' ? '/mo' : pr.interval === 'YEAR' ? '/yr' : ''}</span>, pr.marginBps !== null ? `${(pr.marginBps / 100).toFixed(1)}%` : '—', pr.activeFrom.toISOString().slice(0, 10), pr.activeTo ? pr.activeTo.toISOString().slice(0, 10) : <Pill key="c" tone="success">current</Pill>, `${pr.reason ?? ''}${pr.overrideNote ? ` · override: ${pr.overrideNote}` : ''}`]))} />
          </section>
          <Card>
            <h2 className="font-display text-lg font-semibold">Public copy</h2>
            <ActionForm action={updateProductCopyAction} className="mt-4 space-y-4">
              <CsrfField />
              <input type="hidden" name="productId" value={p.id} />
              <Field label="Name" name="name"><Input name="name" defaultValue={p.name} /></Field>
              <Field label="Tagline" name="tagline"><Input name="tagline" defaultValue={p.tagline} /></Field>
              <Field label="Short description" name="shortDescription"><Textarea name="shortDescription" defaultValue={p.shortDescription} /></Field>
              <Field label="Answer-first block (40–60 words, shown at the top of the page for AI/answer engines)" name="answerFirst"><Textarea name="answerFirst" defaultValue={p.answerFirst} className="min-h-36" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SEO title" name="seoTitle"><Input name="seoTitle" defaultValue={p.seoTitle} /></Field>
                <Field label="SEO description" name="seoDescription"><Input name="seoDescription" defaultValue={p.seoDescription} /></Field>
              </div>
              <SubmitButton>Save copy</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-display text-lg font-semibold">Visibility</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">LIVE (purchasable) requires every integration below to be connected.</p>
            <ul className="mt-4 space-y-2">
              {p.requiredIntegrations.map((k) => {
                const i = integrations.find((x) => x.key === k);
                return <li key={k} className="flex items-center justify-between text-sm"><span>{i?.name ?? k}</span><Pill tone={statusTone(i?.status ?? 'AWAITING_CONFIGURATION')}>{(i?.status ?? 'AWAITING_CONFIGURATION').replace(/_/g, ' ').toLowerCase()}</Pill></li>;
              })}
            </ul>
            <ActionForm action={setVisibilityAction} className="mt-5 space-y-3">
              <CsrfField />
              <input type="hidden" name="productId" value={p.id} />
              <Select name="visibility" defaultValue={p.visibility} aria-label="Visibility">
                <option value="HIDDEN">Hidden — not listed</option>
                <option value="COMING_SOON">Coming soon — page visible, purchase disabled</option>
                <option value="LIVE">Live — purchasable</option>
              </Select>
              <SubmitButton variant="secondary">Update visibility</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="font-display text-lg font-semibold">Cost model</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Used by the margin guard. The worker also records actual costs per job.</p>
            <ActionForm action={updateCostModelAction} className="mt-4 space-y-3">
              <CsrfField />
              <input type="hidden" name="productId" value={p.id} />
              {costFields.map(([k, label, hint]) => (
                <Field key={k} label={label} name={k} hint={hint}><Input name={k} type="number" min={0} defaultValue={String(model[k])} className="font-mono" /></Field>
              ))}
              <SubmitButton variant="secondary">Save cost model</SubmitButton>
            </ActionForm>
          </Card>
        </aside>
      </div>
    </>
  );
}
