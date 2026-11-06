import { Alert, PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { db } from '@/server/db';
import { requireUser } from '@/server/session';
import { assertCan } from '@/server/authz';

export const metadata = { title: 'Email marketing' };

export default async function EmailAdmin() {
  const { user } = await requireUser({ roles: ['ADMIN'] });
  await assertCan(user, 'email_marketing.manage');
  const [subs, unsubscribed, suppressed, campaigns, templates, log, resend] = await Promise.all([
    db().emailSubscriber.count({ where: { status: 'SUBSCRIBED' } }), db().emailSubscriber.count({ where: { status: 'UNSUBSCRIBED' } }), db().emailSuppression.count(),
    db().emailCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }), db().emailTemplate.findMany({ orderBy: { kind: 'asc' } }),
    db().notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }), db().integration.findUnique({ where: { key: 'resend' } }),
  ]);
  return (
    <>
      <PageHeader title="Email marketing" intro="Consent-logged subscribers, one-click List-Unsubscribe, global suppression and a postal address in every marketing email. Transactional mail is separate from marketing consent." />
      {resend?.status !== 'CONNECTED' && <div className="mb-6"><Alert tone="warning" title="Email sending is not connected">Messages are logged as “awaiting configuration” until RESEND_API_KEY is set and the domain is verified.</Alert></div>}
      <div className="mb-8 grid gap-4 sm:grid-cols-3"><Stat label="Subscribed" value={subs} tone="success" /><Stat label="Unsubscribed" value={unsubscribed} /><Stat label="Suppressed" value={suppressed} tone="warning" /></div>
      <h2 className="mb-3 font-display text-lg font-semibold">Campaigns</h2>
      <Table head={['Name', 'Status', 'Scheduled', 'Sent']} empty="No campaigns yet." rows={campaigns.map((c) => [c.name, <Pill key="s" tone={statusTone(c.status)}>{c.status}</Pill>, c.scheduledAt?.toISOString().slice(0, 16) ?? '—', c.sentAt?.toISOString().slice(0, 16) ?? '—'])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Templates</h2>
      <Table head={['Template', 'Kind', 'Subject']} rows={templates.map((t) => [t.name, t.kind.toLowerCase(), <code key="s" className="text-xs">{t.subject}</code>])} />
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Recent sends</h2>
      <Table head={['When', 'To', 'Template', 'Status']} empty="No email activity yet." rows={log.map((l) => [l.createdAt.toISOString().slice(0, 16).replace('T', ' '), l.to, l.template, <Pill key="s" tone={statusTone(l.status)}>{l.status.replace(/_/g, ' ')}</Pill>])} />
    </>
  );
}
