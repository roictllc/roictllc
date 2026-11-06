import { formatUsd } from '@roi/shared-utils';
import { CsrfField } from '@/components/csrf-field';
import { Alert, PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';

export const metadata = { title: 'Billing' };

export default async function Billing() {
  const { data, workspace } = await requireCustomer();
  const [subs, invoices, payments, stripe] = await Promise.all([
    data.subscription.findMany({ include: { price: { include: { plan: { include: { product: true } } } } } }),
    data.invoice.findMany({ orderBy: { createdAt: 'desc' }, take: 24 }),
    db().payment.findMany({ where: { order: { workspaceId: workspace.id } }, orderBy: { createdAt: 'desc' }, take: 24 }),
    db().integration.findUnique({ where: { key: 'stripe' } }),
  ]);
  return (
    <>
      <PageHeader title="Billing" intro="Subscriptions, invoices and payments. Payment methods and cancellations are handled securely in Stripe’s customer portal." actions={stripe?.status === 'CONNECTED' && workspace.stripeCustomerId ? <form action="/api/billing/portal" method="post"><CsrfField /><button className="roi-gradient rounded-full px-5 py-2 text-sm font-semibold text-white">Manage payment methods</button></form> : undefined} />
      {stripe?.status !== 'CONNECTED' && <div className="mb-6"><Alert tone="info">Online payments open soon. Nothing will be charged until then.</Alert></div>}
      <h2 className="mb-3 font-display text-lg font-semibold">Subscriptions</h2>
      <Table head={['Product', 'Price', 'Status', 'Renews', 'Cancels at period end']} empty="No subscriptions." rows={subs.map((s) => [`${s.price.plan.product.name} · ${s.price.plan.name}`, `${formatUsd(s.price.amountCents)}/${s.price.interval === 'YEAR' ? 'yr' : 'mo'}`, <Pill key="s" tone={statusTone(s.status)}>{s.status}</Pill>, s.currentPeriodEnd?.toISOString().slice(0, 10) ?? '—', s.cancelAtPeriodEnd ? 'yes' : 'no'])} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Invoices</h2>
      <Table head={['Number', 'Amount', 'Status', 'Date', '']} empty="No invoices." rows={invoices.map((i) => [i.number ?? '—', formatUsd(i.amountDueCents), <Pill key="s" tone={statusTone(i.status)}>{i.status}</Pill>, i.createdAt.toISOString().slice(0, 10), i.hostedInvoiceUrl ? <a key="l" href={i.hostedInvoiceUrl} className="text-[var(--color-primary)]">View</a> : ''])} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Payments</h2>
      <Table head={['Date', 'Amount', 'Status']} empty="No payments." rows={payments.map((p) => [p.createdAt.toISOString().slice(0, 10), formatUsd(p.amountCents), <Pill key="s" tone={statusTone(p.status)}>{p.status}</Pill>])} />
    </>
  );
}
