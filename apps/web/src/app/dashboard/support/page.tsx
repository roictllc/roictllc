import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Card, Field, Input, PageHeader, Pill, statusTone, Table, Textarea } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { createTicketAction } from '@/server/actions/customer';

export const metadata = { title: 'Support' };

export default async function Support() {
  const { data } = await requireCustomer();
  const tickets = await data.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, include: { messages: { where: { internal: false }, orderBy: { createdAt: 'desc' }, take: 1 } } });
  return (
    <>
      <PageHeader title="Support" intro="Real people, usually within one business day." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Table head={['#', 'Subject', 'Status', 'Last update']} empty="No tickets yet." rows={tickets.map((t) => [t.number, t.subject, <Pill key="s" tone={statusTone(t.status)}>{t.status.replace(/_/g, ' ')}</Pill>, (t.messages[0]?.createdAt ?? t.createdAt).toISOString().slice(0, 16).replace('T', ' ')])} />
        <Card>
          <h2 className="font-display text-lg font-semibold">Open a ticket</h2>
          <ActionForm action={createTicketAction} className="mt-4 space-y-4"><CsrfField /><Field label="Subject" name="subject"><Input name="subject" required /></Field><Field label="How can we help?" name="body"><Textarea name="body" required minLength={10} /></Field><SubmitButton>Send</SubmitButton></ActionForm>
        </Card>
      </div>
    </>
  );
}
