'use client';
import { useActionState, useRef } from 'react';
import { ActionForm, type ActionState } from './action-form';
import { LogoUpload } from './logo-upload';
import { SubmitButton } from './submit-button';
import { FormPendingContext, submitWithoutReset } from './form-pending';
import type { SignatureState } from '@/server/actions/signatures';

const inputCls = 'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none';

/**
 * Product 8 builder (spec §12): company block, template, employee table via CSV paste/import, live watermarked
 * previews, then pay. Employee rows are validated line by line on the server with the shared parser.
 */
export function SignatureBuilder(props: {
  csrf: string;
  templates: Array<{ slug: string; name: string }>;
  defaults: { companyName: string; website?: string; email: string; ownerName: string };
  hasAnimatedLogo: boolean;
  checkoutOpen: boolean;
  price: string;
  maxEmployees: number;
  preview: (s: SignatureState, f: FormData) => Promise<SignatureState>;
  buy: (s: ActionState, f: FormData) => Promise<ActionState>;
}) {
  const [state, action, pending] = useActionState(props.preview, {});
  const csvRef = useRef<HTMLTextAreaElement>(null);
  const exampleCsv = `name,title,department,phone,mobile,email,extra_link\n${props.defaults.ownerName},Owner,,,,${props.defaults.email},`;

  return (
    <div className="space-y-8">
      <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-6" noValidate>
        <FormPendingContext.Provider value={pending}>
        <input type="hidden" name="csrf" value={props.csrf} />
        <section className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Company name<input name="companyName" required maxLength={80} defaultValue={props.defaults.companyName} className={`mt-1.5 ${inputCls}`} /></label>
          <label className="text-sm font-semibold">Website<input name="website" type="url" placeholder="https://" defaultValue={props.defaults.website} className={`mt-1.5 ${inputCls}`} /></label>
          <label className="text-sm font-semibold md:col-span-2">Address (optional)<input name="address" maxLength={200} className={`mt-1.5 ${inputCls}`} /></label>
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            {props.hasAnimatedLogo ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="useAnimatedLogo" defaultChecked /> Use my Animated GIF Logo (recommended)</label>
            ) : (
              <p className="mb-3 text-sm text-[var(--color-muted)]">Tip: an <a href="/dashboard/create/animated-gif-logo" className="text-[var(--color-primary)] underline">animated logo</a> makes every email stand out. Or upload a static logo:</p>
            )}
            <div className="mt-3"><LogoUpload product="email-signature-suite" csrf={props.csrf} minSide={64} label="Static logo (optional)" /></div>
          </div>
          <div className="space-y-4">
            <fieldset><legend className="mb-2 text-sm font-semibold">Brand colors</legend><div className="flex gap-3">{['#0B5FFF', '#111827'].map((c, i) => <input key={i} type="color" name="colors" defaultValue={c} aria-label={`Brand color ${i + 1}`} className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent" />)}</div></fieldset>
            <div className="grid grid-cols-2 gap-3">{['linkedin', 'facebook', 'instagram', 'x'].map((k) => <label key={k} className="text-xs font-semibold capitalize">{k === 'x' ? 'X' : k}<input name={`social_${k}`} type="url" placeholder="https://" className={`mt-1 ${inputCls}`} /></label>)}</div>
          </div>
        </section>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Template</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {props.templates.map((t, i) => (
              <label key={t.slug} className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[rgb(0_229_255/0.08)]">
                <input type="radio" name="templateSlug" value={t.slug} defaultChecked={i === 0} className="sr-only" />{t.name}
              </label>
            ))}
          </div>
        </fieldset>
        <section className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Banner / call to action (optional)<input name="bannerText" maxLength={80} placeholder="Book a free consultation" className={`mt-1.5 ${inputCls}`} /></label>
          <label className="text-sm font-semibold">Banner link<input name="bannerUrl" type="url" placeholder="https://" className={`mt-1.5 ${inputCls}`} /></label>
          <label className="text-sm font-semibold md:col-span-2">Legal disclaimer (optional)<textarea name="disclaimer" maxLength={600} rows={2} className={`mt-1.5 ${inputCls}`} /></label>
        </section>
        <section>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="employeesCsv" className="text-sm font-semibold">Employees (CSV, up to {props.maxEmployees})</label>
            <span className="flex gap-3 text-sm">
              <a href="/api/signatures/template.csv" className="text-[var(--color-primary)] underline">Download the CSV template</a>
              <label className="cursor-pointer text-[var(--color-primary)] underline">Import a CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f && csvRef.current) csvRef.current.value = await f.text(); }} /></label>
            </span>
          </div>
          <textarea ref={csvRef} id="employeesCsv" name="employeesCsv" rows={6} defaultValue={exampleCsv} spellCheck={false} className={`font-mono ${inputCls}`} />
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="utm" /> Add UTM tracking to links</label>
        </section>
        {state?.error && <div role="alert" className="rounded-[var(--radius-md)] border border-[rgb(255_77_94/0.5)] bg-[rgb(255_77_94/0.1)] px-4 py-3 text-sm">{state.error}{state.lineErrors && <ul className="mt-2 list-disc pl-5">{state.lineErrors.map((l) => <li key={l}>{l}</li>)}</ul>}</div>}
        <SubmitButton pendingText="Rendering previews…" size="lg">Preview my signatures</SubmitButton>
        </FormPendingContext.Provider>
      </form>

      {state?.previews && (
        <section className="space-y-4" aria-live="polite">
          <h2 className="font-display text-xl font-semibold">Preview {state.count && state.count > 3 ? `(first 3 of ${state.count})` : ''}</h2>
          {state.previews.map((p) => (
            <div key={p.name} className="select-none rounded-[var(--radius-lg)] bg-white p-5 text-black" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
              <div dangerouslySetInnerHTML={{ __html: p.html }} />
            </div>
          ))}
          <div className="roi-gradient-border rounded-[var(--radius-xl)] p-6">
            <h3 className="font-display text-lg font-semibold">Get the clean suite — {props.price}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">HTML + plain-text signature per person, a gallery page with copy buttons, install guides for Gmail, Outlook, Apple Mail and Thunderbird, and a ZIP. Logos stay hosted for at least 24 months.</p>
            {props.checkoutOpen ? (
              <ActionForm action={props.buy} className="mt-4 space-y-3">
                <input type="hidden" name="csrf" value={props.csrf} />
                <input type="hidden" name="draft" value={state.draft} />
                <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> I agree that delivery starts immediately after payment and accept the Terms and Refund Policy.</label>
                <SubmitButton pendingText="Opening secure checkout…">Pay and get my signatures</SubmitButton>
              </ActionForm>
            ) : (
              <p className="mt-3 text-sm">Online checkout opens soon — we will email you when you can buy.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
