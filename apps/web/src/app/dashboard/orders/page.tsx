import { formatUsd } from '@roi/shared-utils';
import { PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';

export const metadata = { title: 'Orders' };

export default async function CustomerOrders() {
  const { data } = await requireCustomer();
  const orders = await data.order.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true, plan: true } } } });
  return (
    <>
      <PageHeader title="Orders" intro="Every order with its live status. Automated products update as soon as each step finishes." />
      <Table head={['Order', 'Items', 'Total', 'Status', 'Date']} empty="No orders yet."
        rows={orders.map((o) => [<span key="n" className="font-mono">{o.orderNumber}</span>, o.items.map((i) => `${i.product.name} (${i.plan.name})`).join(', '), formatUsd(o.totalCents), <Pill key="s" tone={statusTone(o.status)}>{o.status.replace(/_/g, ' ')}</Pill>, o.createdAt.toISOString().slice(0, 10)])} />
    </>
  );
}
