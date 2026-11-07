import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUsd } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { WebsiteForm } from '@/components/website-form';
import { Alert, Card, Input, PageHeader, Pill, statusTone, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { getFlag, getPublicProduct } from '@/server/catalog';
import { connectDomainAction, publishVersionAction, subscribeWebsiteAction, verifyDomainAction } from '@/server/actions/websites';

export const metadata: Metadata = { title: 'Manage website' };

/** Product 5 management (spec §12): preview, versions with rollback, publishing status, domain, leads, editor. */
export default async function ManageWebsite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; unchanged?: string; edit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await requireCustomer();
  const site = await c.data.website.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' }, take: 20 }, deployments: { orderBy: { startedAt: 'desc' }, take: 10, include: { version: { select: { version: true } } } }, leads: { orderBy: { createdAt: 'desc' }, take: 20 }, domains: true } });
  if (!site) notFound();
  const [sub, checkout, product, jobs] = await Promise.all([
    site.subscriptionId ? db().subscription.findUnique({ where: { id: site.subscriptionId } }) : null,
    getFlag('checkout'), getPublicProduct('landing-page-hosting'),
    db().automationJob.findMany({ where: { workspaceId: c.workspaceId, type: 'website.publish', status: { in: ['PENDING', 'PROCESSING'] }, payload: { path: ['websiteId'], equals: id } }, take: 1 }),
  ]);
  const shown = site.versions.find((v) => String(v.version) === sp.v) ?? site.versions[0];
  const live = site.deployments.find((d) => d.status === 'LIVE');
  const publishing = jobs.length > 0 || site.status === 'PUBLISHING';
  const subscribed = !!sub && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status);
  const plan = product?.plans.find((p) => p.published && p.price);
  const input = (site.content as { input?: Record<string, unknown> }).input ?? {};
  const domain = site.domains[0];
  const ver = (domain?.verification ?? {}) as { txtName?: string; txtValue?: string; verifiedAt?: string };
  const hostTarget = process.env.ROI_SITE_HOST_TARGET ?? (site.hostingProvider === 'cloudflare-pages' ? `${(site.design as { projectName?: string }).projectName}.pages.dev` : 'sites.roictllc.com');
  return (
    <>
      <PageHeader title={site.name} intro={site.liveUrl ? <>Live at <a href={site.liveUrl} className="text-[var(--color-primary)] underline" target="_blank" rel="noopener noreferrer">{site.liveUrl}</a></> : site.status === 'LIVE' ? 'Published. Connect and verify your domain below to make it public.' : 'Not published yet — preview below.'} actions={<Pill tone={statusTone(site.status)}>{site.status}</Pill>} />
      <AutoRefresh active={publishing} />
      {sp.unchanged && <div className="mb-4"><Alert tone="info" title="No changes">That version is identical to the previous one.</Alert></div>}
      {shown?.notes?.startsWith('NEEDS_REVIEW') && <div className="mb-4"><Alert tone="warning" title="Waiting for a quick review">{shown.notes.replace('NEEDS_REVIEW: ', '')}. Make your description or services more specific and save again, or our team will review it.</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <p className="text-sm font-semibold">Preview · version {shown?.version}</p>
            {shown && <a href={`/site-preview/${site.id}/${shown.version}/`} target="_blank" rel="noopener" className="text-sm text-[var(--color-primary)]">Open full preview ↗</a>}
          </div>
          {shown && <iframe title={`Preview of ${site.name}`} src={`/site-preview/${site.id}/${shown.version}/`} className="h-[640px] w-full bg-white" sandbox="allow-same-origin allow-popups" />}
        </Card>
        <div className="space-y-6">
          <Card glow={!subscribed}>
            <h2 className="font-display text-lg font-semibold">{subscribed ? 'Publishing' : 'Go live'}</h2>
            {subscribed ? (
              <>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{publishing ? 'Publishing now…' : live ? `Version ${live.version?.version} is live on ${live.provider === 'roi-host' ? 'the ROI host' : 'Cloudflare'}.` : 'Not published yet.'}</p>
                {shown && shown.id !== live?.versionId && (
                  <ActionForm action={publishVersionAction} className="mt-3"><CsrfField /><input type="hidden" name="websiteId" value={site.id} /><input type="hidden" name="versionId" value={shown.id} /><SubmitButton size="sm" pendingText="Starting…">Publish version {shown.version}</SubmitButton></ActionForm>
                )}
              </>
            ) : checkoutFlagOpen(checkout, product?.visibility) && plan ? (
              <ActionForm action={subscribeWebsiteAction} className="mt-3 space-y-3">
                <CsrfField /><input type="hidden" name="websiteId" value={site.id} />
                <p className="font-mono text-2xl">{formatUsd(plan.price!.amountCents)}<span className="text-sm text-[var(--color-muted)]">/month</span></p>
                <p className="text-sm text-[var(--color-muted)]">Hosting, SSL, uptime checks and the lead inbox. Your site publishes automatically after payment. Cancel anytime; it stays up until the paid period ends.</p>
                <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> I agree to the monthly subscription, the <Link href="/legal/terms" className="underline">Terms</Link> and the <Link href="/legal/refund-policy" className="underline">Refund Policy</Link>.</label>
                <SubmitButton pendingText="Opening secure checkout…">Subscribe and publish</SubmitButton>
              </ActionForm>
            ) : <p className="mt-2 text-sm text-[var(--color-muted)]">Online checkout opens soon. Your site and its versions are saved.</p>}
          </Card>
          <Card>
            <h2 className="font-display text-lg font-semibold">Your domain</h2>
            {!domain ? (
              <ActionForm action={connectDomainAction} className="mt-3 space-y-3"><CsrfField /><input type="hidden" name="websiteId" value={site.id} /><Input name="domain" aria-label="Domain you own" placeholder="www.yourbusiness.com" required /><SubmitButton size="sm" variant="secondary">Connect a domain I own</SubmitButton><p className="text-xs text-[var(--color-muted)]">Buying a new domain through ROI opens with the registrar integration.</p></ActionForm>
            ) : (
              <div className="mt-2 space-y-3 text-sm">
                <p><strong>{domain.name}</strong> {ver.verifiedAt ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Waiting for DNS</Pill>}</p>
                <Table head={['Type', 'Name', 'Value']} rows={[['TXT', ver.txtName ?? '', <code key="v" className="break-all text-xs">{ver.txtValue}</code>], ['CNAME', domain.name, hostTarget]]} />
                {!ver.verifiedAt && <ActionForm action={verifyDomainAction}><CsrfField /><input type="hidden" name="domain" value={domain.name} /><SubmitButton size="sm" variant="secondary" pendingText="Checking DNS…">Verify</SubmitButton></ActionForm>}
              </div>
            )}
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Versions</h2>
        <Table head={['Version', 'Saved', 'Notes', 'Status', '']} rows={site.versions.map((v) => [
          `v${v.version}`, v.createdAt.toISOString().slice(0, 16).replace('T', ' '), <span key="n" className="text-xs">{v.notes}</span>,
          live?.versionId === v.id ? <Pill key="s" tone="success">LIVE</Pill> : '',
          <span key="a" className="flex gap-3 text-sm"><Link href={`/dashboard/website/${site.id}?v=${v.version}`} className="text-[var(--color-primary)]">Preview</Link>{subscribed && live && live.versionId !== v.id && !v.notes?.startsWith('NEEDS_REVIEW') && <ActionForm action={publishVersionAction} className="inline"><CsrfField /><input type="hidden" name="websiteId" value={site.id} /><input type="hidden" name="versionId" value={v.id} /><SubmitButton size="sm" variant="ghost">{v.version < (live.version?.version ?? 0) ? 'Roll back to this' : 'Publish'}</SubmitButton></ActionForm>}</span>,
        ])} />
        {site.deployments.length > 0 && <p className="mt-3 text-xs text-[var(--color-muted)]">Last deployment: {site.deployments[0].status} · {site.deployments[0].provider} · {site.deployments[0].startedAt.toISOString().slice(0, 16).replace('T', ' ')}</p>}
      </Card>
      <Card className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Leads inbox</h2>
        <Table head={['Received', 'Name', 'Contact', 'Message']} empty="No leads yet. Messages from your website’s contact form arrive here and by email." rows={site.leads.map((l) => [l.createdAt.toISOString().slice(0, 16).replace('T', ' '), l.name, [l.email, l.phone].filter(Boolean).join(' · '), <span key="m" className="block max-w-md truncate">{l.message}</span>])} />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-5 font-display text-lg font-semibold">Edit your site</h2>
        <p className="mb-5 text-sm text-[var(--color-muted)]">Saving creates a new version. Nothing changes on your live site until you publish it.</p>
        <WebsiteForm websiteId={site.id} d={input as never} submitLabel="Save as a new version" />
      </Card>
    </>
  );
}

function checkoutFlagOpen(flag: string | null, visibility?: string) {
  return flag === 'LIVE' && visibility === 'LIVE';
}
