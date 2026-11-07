import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ANIMATION_STYLES, LOGO_CATEGORIES, LOGO_STYLES } from '@roi/validation';
import { formatUsd } from '@roi/shared-utils';
import { ActionForm } from '@/components/action-form';
import { CsrfField } from '@/components/csrf-field';
import { SubmitButton } from '@/components/submit-button';
import { Turnstile } from '@/components/turnstile';
import { AutoRefresh } from '@/components/auto-refresh';
import { LogoUpload } from '@/components/logo-upload';
import { PreviewImage, PreviewVideo } from '@/components/protected-media';
import { Alert, Card, Field, Input, PageHeader, Pill, Select, Textarea } from '@/components/ui';
import { requireCustomer } from '@/server/customer';
import { csrfToken } from '@/server/csrf';
import { db } from '@/server/db';
import { getFlag, getPublicProduct } from '@/server/catalog';
import { isCreateSlug, previewAvailability, previewJob, previewUrl, workerOnline, type CreateSlug } from '@/server/previews';
import { buyPreviewAction, startConceptsAction, startUploadPreviewAction } from '@/server/actions/create';
import { resendVerificationAction } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Create' };

const TITLES: Record<CreateSlug, { title: string; intro: string }> = {
  'animated-gif-logo': { title: 'Animated GIF Logo', intro: 'Upload your logo, pick a style and see a free watermarked preview. Pay only when you love it — the 10-second reveal video is included.' },
  'logo-revival': { title: 'Logo Revival', intro: 'Upload a blurry or tiny logo. You get a free 10-second watermarked video of the revived version before you pay.' },
  'logo-generator': { title: 'Unique Logo Generator', intro: 'Describe your business and ROI’s vector engine draws three original, similarity-screened concepts. Pick one and a package.' },
};

const STYLE_HINTS: Record<string, string> = {
  'shine-sweep': 'A light sweep glides across', 'pulse-glow': 'Soft breathing glow', float: 'Gentle hover', 'draw-on': 'Reveals left to right',
  'particle-assemble': 'Particles fly in and form it', 'glitch-in': 'Digital glitch, then clean', spotlight: 'A spotlight finds it', '3d-flip': 'Flips in 3D',
  ripple: 'Water-like ripple', 'neon-outline': 'Neon edge light',
};

const label = (s: string) => s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function JobState({ job, online, what }: { job: Awaited<ReturnType<typeof previewJob>>; online: boolean; what: string }) {
  if (!job) return <Alert tone="warning" title="Not found">We could not find this preview. Start a new one below.</Alert>;
  if (job.status === 'PENDING')
    return (
      <Alert tone="info" title={`Your ${what} is queued`}>
        {online ? 'It usually starts within a few seconds.' : 'Our media server is offline right now. Your preview is saved and will start automatically when it is back — you can leave this page.'}
      </Alert>
    );
  if (job.status === 'PROCESSING')
    return (
      <Alert tone="info" title={`Making your ${what}…`}>
        <span className="flex flex-wrap gap-2">{job.steps.map((s) => <Pill key={s.name} tone={s.status === 'COMPLETED' ? 'success' : 'info'}>{s.status === 'COMPLETED' ? '✓ ' : ''}{label(s.name)}</Pill>)}</span>
      </Alert>
    );
  if (job.status === 'FAILED' || job.status === 'DEAD' || job.status === 'CANCELED')
    return <Alert tone="danger" title="We could not make this preview">{job.lastError?.startsWith('Could not produce') ? 'The engine could not find three concepts distinct enough from existing logos. Try a different style or colors.' : 'Something went wrong while rendering. Try again, or try another file. Our team has been notified.'}</Alert>;
  return null;
}

async function BuyPanel({ slug, hidden, plans, checkoutOpen }: { slug: CreateSlug; hidden: Record<string, string>; plans: Array<{ id: string; name: string; features: string[]; amountCents: number; isDefault: boolean }>; checkoutOpen: boolean }) {
  return (
    <Card glow className="roi-gradient-border !bg-[var(--color-surface-solid)]">
      <h2 className="font-display text-xl font-semibold">Love it? Get the clean files</h2>
      {!checkoutOpen ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">Online checkout opens soon. Your preview is saved in your account; we will email you the moment you can buy it.</p>
      ) : (
        <ActionForm action={buyPreviewAction} className="mt-4 space-y-4">
          <CsrfField />
          <input type="hidden" name="product" value={slug} />
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {plans.length > 1 ? (
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold">Choose a package</legend>
              {plans.map((p) => (
                <label key={p.id} className="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[rgb(0_229_255/0.06)]">
                  <input type="radio" name="planId" value={p.id} defaultChecked={p.isDefault} className="sr-only" />
                  <span className="flex items-baseline justify-between"><span className="font-semibold">{p.name}</span><span className="font-mono">{formatUsd(p.amountCents)}</span></span>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                </label>
              ))}
            </fieldset>
          ) : (
            <>
              <input type="hidden" name="planId" value={plans[0]?.id ?? ''} />
              <p className="font-mono text-2xl">{plans[0] ? formatUsd(plans[0].amountCents) : '—'}</p>
            </>
          )}
          <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> I agree that delivery starts immediately after payment and accept the <Link href="/legal/terms" className="text-[var(--color-primary)] underline">Terms</Link> and <Link href="/legal/refund-policy" className="text-[var(--color-primary)] underline">Refund Policy</Link>.</label>
          <SubmitButton pendingText="Opening secure checkout…">Pay and get my files</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}

export default async function CreatePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ r?: string; req?: string }> }) {
  const { slug } = await params;
  if (!isCreateSlug(slug)) notFound();
  const sp = await searchParams;
  const c = await requireCustomer();
  const product = await getPublicProduct(slug);
  if (!product || product.visibility === 'HIDDEN') notFound();
  const [avail, online, csrf, checkoutFlag] = await Promise.all([previewAvailability(slug), workerOnline(), csrfToken(), getFlag('checkout')]);
  const checkoutOpen = checkoutFlag === 'LIVE' && product.visibility === 'LIVE';
  const plans = product.plans.filter((p) => p.published && p.price && p.price.amountCents > 0).map((p) => ({ id: p.id, name: p.name, features: p.features, amountCents: p.price!.amountCents, isDefault: p.isDefault }));
  const verified = !!c.user.emailVerifiedAt;
  const t = TITLES[slug];

  // ── Result section ──
  let result: ReactNode = null;
  let running = false;
  if (sp.r && slug !== 'logo-generator') {
    const render = await db().logoRender.findFirst({ where: { id: sp.r, upload: { workspaceId: c.workspaceId } } });
    const job = render ? await previewJob(`preview:${render.id}`) : null;
    const done = render?.deliverableId ? await db().generatedDeliverable.findFirst({ where: { id: render.deliverableId, workspaceId: c.workspaceId } }) : null;
    running = !done && !!job && (job.status === 'PENDING' || job.status === 'PROCESSING');
    const poster = done && slug === 'logo-revival' ? await db().generatedDeliverable.findFirst({ where: { jobId: done.jobId, kind: 'preview-poster' } }) : null;
    const rp = (render?.params as { metrics?: { improvement: number; outWidth: number; outHeight: number }; vectorAvailable?: boolean } | null) ?? null;
    const metrics = rp?.metrics ? { ...rp.metrics, vectorAvailable: rp.vectorAvailable } : null;
    result = (
      <section className="mb-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Your free preview</h2><Pill tone="warning">Watermarked</Pill></div>
          {done ? (
            slug === 'animated-gif-logo' ? <PreviewImage src={previewUrl(done.id, c.workspaceId)} alt="Watermarked animated preview of your logo" /> : <PreviewVideo src={previewUrl(done.id, c.workspaceId)} poster={poster ? previewUrl(poster.id, c.workspaceId) : undefined} />
          ) : (
            <JobState job={job} online={online} what="preview" />
          )}
          {done && slug === 'animated-gif-logo' && <p className="mt-3 text-xs text-[var(--color-muted)]">Preview: 480 px, 2 seconds. Your paid files: 1920×1080 master GIF, email GIF under 1 MB, PNG fallback, 10-second 1080p reveal video and your original.</p>}
          {done && slug === 'logo-revival' && metrics?.improvement && (
            <p className="mt-3 text-xs text-[var(--color-muted)]">Measured sharpness ×{metrics.improvement.toFixed(1)} · output {metrics.outWidth}×{metrics.outHeight} px{metrics.vectorAvailable ? ' · traced vector available' : ''}. Revival is an enhanced reconstruction, not a guaranteed copy of a lost original.</p>
          )}
        </Card>
        {done ? <BuyPanel slug={slug} hidden={{ renderId: render!.id }} plans={plans} checkoutOpen={checkoutOpen} /> : <div />}
      </section>
    );
  }
  if (sp.req && slug === 'logo-generator') {
    const job = await previewJob(`preview:concepts:${sp.req}`);
    const concepts = await c.data.logoConcept.findMany({ where: { requestId: sp.req }, orderBy: { createdAt: 'asc' }, include: { reports: { take: 1, orderBy: { createdAt: 'desc' } } } });
    const previews = job ? await db().generatedDeliverable.findMany({ where: { jobId: job.id, isPreview: true, workspaceId: c.workspaceId } }) : [];
    running = concepts.length < 3 && !!job && (job.status === 'PENDING' || job.status === 'PROCESSING');
    const nameCheck = (concepts[0]?.reports[0]?.nameCheck ?? null) as { result: string; checkedSources: string[]; usptoSearchUrl: string } | null;
    result = (
      <section className="mb-10 space-y-6">
        {concepts.length < 3 ? (
          <JobState job={job} online={online} what="three concepts" />
        ) : (
          <ActionForm action={buyPreviewAction} className="space-y-6">
            <CsrfField />
            <input type="hidden" name="product" value="logo-generator" />
            <fieldset>
              <legend className="mb-3 font-display text-xl font-semibold">Choose your concept</legend>
              <div className="grid gap-5 md:grid-cols-3">
                {concepts.map((cn, i) => {
                  const pv = previews.find((p) => p.kind === `concept-preview:${cn.id}`);
                  return (
                    <label key={cn.id} className="cursor-pointer rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-3 has-[:checked]:outline has-[:checked]:outline-4 has-[:checked]:outline-[var(--color-primary)]">
                      <input type="radio" name="conceptId" value={cn.id} defaultChecked={i === 0} className="sr-only" />
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg">{pv ? <PreviewImage src={previewUrl(pv.id, c.workspaceId)} alt={`Logo concept ${i + 1} (watermarked)`} className="flex h-full w-full items-center justify-center" /> : null}</div>
                      <span className="mt-2 block text-center text-sm font-semibold text-slate-800">Concept {i + 1} · {label(cn.archetype)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p className="text-xs text-[var(--color-muted)]">
              Similarity-screened against {concepts[0].reports[0]?.checkedCount ?? 0} existing ROI marks and reference motifs — not a trademark clearance. Business name: {nameCheck?.result ?? 'not checked'} ({nameCheck?.checkedSources.join(', ')}).{' '}
              {nameCheck && <a href={nameCheck.usptoSearchUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">Search the USPTO yourself</a>}
            </p>
            {checkoutOpen ? (
              <Card glow className="space-y-4">
                <fieldset className="grid gap-3 sm:grid-cols-3">
                  <legend className="mb-2 text-sm font-semibold">Choose a package</legend>
                  {plans.map((p) => (
                    <label key={p.id} className="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[rgb(0_229_255/0.06)]">
                      <input type="radio" name="planId" value={p.id} defaultChecked={p.isDefault} className="sr-only" />
                      <span className="flex items-baseline justify-between"><span className="font-semibold">{p.name}</span><span className="font-mono">{formatUsd(p.amountCents)}</span></span>
                      <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                    </label>
                  ))}
                </fieldset>
                <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> I agree that delivery starts immediately after payment and accept the <Link href="/legal/terms" className="text-[var(--color-primary)] underline">Terms</Link> and <Link href="/legal/refund-policy" className="text-[var(--color-primary)] underline">Refund Policy</Link>.</label>
                <SubmitButton pendingText="Opening secure checkout…">Pay and get my logo</SubmitButton>
              </Card>
            ) : (
              <Alert tone="info" title="Checkout opens soon">Your concepts are saved in your account. We will email you the moment you can buy them.</Alert>
            )}
          </ActionForm>
        )}
      </section>
    );
  }

  // ── Form section ──
  const form =
    slug === 'logo-generator' ? (
      <ActionForm action={startConceptsAction}>
        <CsrfField />
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Company name" name="companyName"><Input id="companyName" name="companyName" required minLength={2} maxLength={60} defaultValue={c.workspace.name} /></Field>
          <Field label="Tagline (optional)" name="tagline"><Input id="tagline" name="tagline" maxLength={80} /></Field>
          <Field label="Industry" name="category">
            <Select id="category" name="category" required defaultValue="other">{LOGO_CATEGORIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select>
          </Field>
          <Field label="Words or symbols to avoid (optional)" name="avoid"><Input id="avoid" name="avoid" maxLength={200} /></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Preferred colors (1–3)</legend>
          <div className="flex gap-3">{['#00E5FF', '#7B3FFF', '#FF2D95'].map((col, i) => <input key={i} type="color" name="colors" defaultValue={col} aria-label={`Color ${i + 1}`} className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent" />)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Style</legend>
          <div className="flex flex-wrap gap-2">{LOGO_STYLES.map((s, i) => <label key={s} className="cursor-pointer rounded-full border border-[var(--color-border)] px-4 py-2 text-sm has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[rgb(0_229_255/0.08)]"><input type="radio" name="style" value={s} defaultChecked={i === 0} className="sr-only" />{label(s)}</label>)}</div>
        </fieldset>
        <Turnstile />
        <SubmitButton pendingText="Starting…" size="lg">Create my 3 free concepts</SubmitButton>
      </ActionForm>
    ) : (
      <ActionForm action={startUploadPreviewAction}>
        <CsrfField />
        <input type="hidden" name="product" value={slug} />
        <LogoUpload product={slug} csrf={csrf} minSide={slug === 'logo-revival' ? 64 : 300} />
        {slug === 'animated-gif-logo' ? (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Animation style</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {ANIMATION_STYLES.map((s, i) => (
                  <label key={s} className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[rgb(0_229_255/0.08)]">
                    <input type="radio" name="style" value={s} defaultChecked={i === 0} className="sr-only" />
                    <span className="block font-semibold">{label(s)}</span><span className="text-xs text-[var(--color-muted)]">{STYLE_HINTS[s]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-5 md:grid-cols-3">
              <Field label="Background" name="background"><Select id="background" name="background" defaultValue="keep"><option value="keep">Keep original</option><option value="transparent">Make transparent</option><option value="solid">Solid color</option></Select></Field>
              <Field label="Solid color (if chosen)" name="backgroundColor"><Input id="backgroundColor" name="backgroundColor" type="color" defaultValue="#FFFFFF" className="h-11" /></Field>
              <Field label="Loop speed" name="loopSpeed"><Select id="loopSpeed" name="loopSpeed" defaultValue="normal"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></Select></Field>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Tagline for the reveal video (optional)" name="tagline"><Input id="tagline" name="tagline" maxLength={60} /></Field>
              <fieldset><legend className="mb-2 text-sm font-semibold">Effect colors</legend><div className="flex gap-3">{['#00E5FF', '#7B3FFF'].map((col, i) => <input key={i} type="color" name="effectColors" defaultValue={col} aria-label={`Effect color ${i + 1}`} className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent" />)}</div></fieldset>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <fieldset><legend className="mb-2 text-sm font-semibold">Output</legend><div className="flex gap-2">{[['transparent', 'Transparent background'], ['white', 'White background']].map(([v, l], i) => <label key={v} className="cursor-pointer rounded-full border border-[var(--color-border)] px-4 py-2 text-sm has-[:checked]:border-[var(--color-primary)]"><input type="radio" name="output" value={v} defaultChecked={i === 0} className="sr-only" />{l}</label>)}</div></fieldset>
              <fieldset><legend className="mb-2 text-sm font-semibold">Logo type</legend><div className="flex gap-2">{[['flat', 'Flat / graphic'], ['photographic', 'Photographic']].map(([v, l], i) => <label key={v} className="cursor-pointer rounded-full border border-[var(--color-border)] px-4 py-2 text-sm has-[:checked]:border-[var(--color-primary)]"><input type="radio" name="logoType" value={v} defaultChecked={i === 0} className="sr-only" />{l}</label>)}</div></fieldset>
            </div>
            <Field label="Text correction notes (optional)" name="notes"><Textarea id="notes" name="notes" maxLength={500} rows={3} placeholder="For example: the tagline should read “Since 1998”." /></Field>
          </>
        )}
        <Turnstile />
        <SubmitButton pendingText="Starting…" size="lg">{slug === 'logo-revival' ? 'Make my free preview video' : 'Make my free preview'}</SubmitButton>
      </ActionForm>
    );

  return (
    <>
      <PageHeader title={t.title} intro={t.intro} actions={<Link href={`/products/${slug}`} className="text-sm text-[var(--color-primary)]">Product details →</Link>} />
      <AutoRefresh active={running} />
      {result}
      {!verified ? (
        <Card>
          <Alert tone="warning" title="Verify your email to unlock free previews">We sent a link to {c.user.email} when you signed up. Previews need a verified account so they stay free for real businesses.</Alert>
          <ActionForm action={resendVerificationAction} className="mt-4 space-y-3"><CsrfField /><SubmitButton variant="secondary" pendingText="Sending…">Send me a new link</SubmitButton></ActionForm>
        </Card>
      ) : !avail.ok ? (
        <Alert tone="info" title="Coming soon">{avail.reason}</Alert>
      ) : (
        <Card>
          <h2 className="mb-5 font-display text-xl font-semibold">{result ? 'Try another version' : 'Start here'}</h2>
          {form}
        </Card>
      )}
    </>
  );
}
