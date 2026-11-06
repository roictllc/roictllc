import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { PlatformChip } from '@/components/platform-chip';
import { LiveRefresh } from '@/components/live-refresh';
import { SubmitButton } from '@/components/submit-button';
import { Alert, Card, DataAge, PageHeader, Pill, Stat, statusTone, Table } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { db } from '@/server/db';
import { setPostingModeAction, toggleSocialPauseAction } from '@/server/actions/customer';

export const metadata = { title: 'Social command center' };
const PLATFORMS = [
  { key: 'INSTAGRAM', flag: 'social.instagram' }, { key: 'TIKTOK', flag: 'social.tiktok' }, { key: 'FACEBOOK', flag: 'social.facebook' }, { key: 'X', flag: 'social.x' },
] as const;

export default async function SocialCommandCenter() {
  const { workspaceId, data } = await requireCustomer();
  const [accounts, flags, published, queue, metrics] = await Promise.all([
    data.socialAccount.findMany({ include: { insightModel: true } }),
    db().featureFlag.findMany({ where: { key: { startsWith: 'social.' } } }),
    data.socialPost.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 20, include: { socialAccount: { select: { platform: true, handle: true } }, metrics: { orderBy: { capturedAt: 'desc' }, take: 1 } } }),
    data.socialPost.findMany({ where: { status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'] } }, orderBy: { scheduledFor: 'asc' }, take: 20, include: { socialAccount: { select: { platform: true } } } }),
    db().socialPostMetricSnapshot.findMany({ where: { post: { workspaceId } }, orderBy: { capturedAt: 'desc' }, take: 200 }),
  ]);
  const latestByPost = new Map<string, (typeof metrics)[number]>();
  for (const m of metrics) if (!latestByPost.has(m.postId)) latestByPost.set(m.postId, m);
  const latest = [...latestByPost.values()];
  const reach = latest.reduce((s, m) => s + (m.reach ?? 0), 0);
  const eng = latest.filter((m) => m.engagementRate !== null);
  const avgEr = eng.length ? eng.reduce((s, m) => s + (m.engagementRate ?? 0), 0) / eng.length : null;
  const newest = metrics[0];

  return (
    <>
      <LiveRefresh channel="social" />
      <PageHeader title="Social command center" intro="Connect your accounts once — ROI studies your market, plans, creates and publishes, and shows the results here as platforms report them." />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Connected accounts" value={accounts.length} />
        <Stat label="Posts published (latest 20)" value={published.length} tone="success" />
        <Stat label="Reach (latest snapshots)" value={reach.toLocaleString('en-US')} hint={newest ? <DataAge at={newest.capturedAt} source={newest.source} /> : 'No metrics yet'} />
        <Stat label="Avg. engagement rate" value={avgEr !== null ? `${(avgEr * 100).toFixed(2)}%` : '—'} hint="(reactions + comments + shares + saves) ÷ reach" tone="violet" />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Connect your accounts</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map((p) => {
            const acct = accounts.find((a) => a.platform === p.key);
            const live = flags.find((f) => f.key === p.flag)?.visibility === 'LIVE';
            return (
              <Card key={p.key} className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between"><PlatformChip platform={p.key} />{acct ? <Pill tone={statusTone(acct.paused ? 'SUSPENDED' : 'CONNECTED')}>{acct.paused ? 'paused' : 'connected'}</Pill> : null}</div>
                {acct ? <p className="text-sm text-[var(--color-muted)]">@{acct.handle} · {acct.autopilot ? 'Full Autopilot' : acct.postingMode.replace('_', ' ').toLowerCase()}</p>
                  : live ? <a href={`/api/social/connect/${p.key.toLowerCase()}`} className="roi-gradient rounded-full px-4 py-2 text-center text-sm font-semibold text-white">Connect {p.key === 'X' ? 'X' : p.key.charAt(0) + p.key.slice(1).toLowerCase()}</a>
                  : <p className="text-sm text-[var(--color-muted)]">Available soon — we are completing this platform’s official approval.</p>}
              </Card>
            );
          })}
        </div>
      </section>

      {accounts.length === 0 && <Alert tone="info" title="How Autopilot works">After you connect an account and complete your brand kit, ROI builds a 30-day calendar from your own results and your industry’s benchmarks. Choose Full Autopilot (ROI publishes without asking, with your recorded consent) or approve-first. Pause anytime. ROI never likes, follows or comments for you.</Alert>}

      {accounts.map((a) => (
        <Card key={a.id} className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><PlatformChip platform={a.platform} /><p className="mt-2 text-sm text-[var(--color-muted)]">@{a.handle}{a.autopilotConsentAt ? ` · Autopilot consent recorded ${a.autopilotConsentAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}</p></div>
            <ActionForm action={toggleSocialPauseAction}><CsrfField /><input type="hidden" name="accountId" value={a.id} /><SubmitButton size="sm" variant={a.paused ? 'primary' : 'danger'}>{a.paused ? 'Resume posting' : 'Pause all posting'}</SubmitButton></ActionForm>
          </div>
          <ActionForm action={setPostingModeAction} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <CsrfField /><input type="hidden" name="accountId" value={a.id} />
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Posting mode</legend>
              {[['AUTO_PUBLISH', 'Full Autopilot — ROI plans and publishes without asking'], ['APPROVE_FIRST', 'Approve first — I approve every post'], ['MANAGER_REVIEW', 'Manager review — my ROI manager approves']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value={v} defaultChecked={a.postingMode === v} className="accent-[var(--color-primary)]" />{l}</label>
              ))}
              <label className="mt-2 flex items-start gap-2 text-xs text-[var(--color-muted)]"><input type="checkbox" name="consent" className="mt-0.5" />I authorize ROI to publish posts to this account without asking me first. I can turn this off at any time.</label>
            </fieldset>
            <SubmitButton size="sm" variant="secondary">Save mode</SubmitButton>
          </ActionForm>
          {a.insightModel && (
            <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-white/[0.02] p-4 text-sm">
              <p className="font-semibold">What ROI learned ({a.insightModel.sampleSize} posts, trained {a.insightModel.trainedAt.toISOString().slice(0, 10)})</p>
              <ul className="mt-2 list-disc pl-5 text-[var(--color-muted)]">{((a.insightModel.summary as { insights?: string[] }).insights ?? []).map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </Card>
      ))}

      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Coming up</h2>
        <Table head={['Scheduled', 'Platform', 'Status', 'Caption']} empty="Nothing scheduled yet."
          rows={queue.map((p) => [p.scheduledFor?.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', p.socialAccount.platform, <Pill key="s" tone={statusTone(p.status)}>{p.status.replace(/_/g, ' ')}</Pill>, <span key="c" className="block max-w-md truncate">{p.caption}</span>])} />
      </section>
      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Published by ROI</h2>
        <Table head={['Exact time ROI posted', 'Platform', 'Caption', 'Reach', 'Engagement', 'Data age']} empty="No posts published yet."
          rows={published.map((p) => {
            const m = p.metrics[0];
            return [p.publishedAt?.toISOString().slice(0, 19).replace('T', ' ') + ' UTC', p.socialAccount.platform, <span key="c" className="block max-w-xs truncate">{p.permalink ? <a href={p.permalink} className="text-[var(--color-primary)]">{p.caption}</a> : p.caption}</span>, m?.reach?.toLocaleString('en-US') ?? '—', m?.engagementRate != null ? `${(m.engagementRate * 100).toFixed(2)}%` : '—', m ? <DataAge key="d" at={m.capturedAt} source={m.source} /> : 'waiting for platform'];
          })} />
      </section>
    </>
  );
}
