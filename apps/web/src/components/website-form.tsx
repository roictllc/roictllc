import { INDUSTRIES } from '@roi/validation';
import { ActionForm } from './action-form';
import { CsrfField } from './csrf-field';
import { SubmitButton } from './submit-button';
import { Field, Input, Select, Textarea } from './ui';
import { saveWebsiteAction } from '@/server/actions/websites';

type Input = {
  businessName?: string; industry?: string; description?: string; tagline?: string; services?: Array<{ name: string; description: string; priceCents?: number }>;
  phone?: string; email?: string; address?: string; city?: string; state?: string; hours?: string; serviceAreas?: string[]; colors?: string[]; design?: string;
  ctaGoal?: string; bookingUrl?: string; social?: Record<string, string>; testimonials?: Array<{ quote: string; author: string }>; licenses?: string;
};
const label = (s: string) => s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const DESIGNS = [['aurora', 'Aurora — dark, modern'], ['clean', 'Clean — light, minimal'], ['classic', 'Classic — serif, trusted'], ['bold', 'Bold — high contrast'], ['warm', 'Warm — friendly']];

/** Product 5 form (spec §12): every field from the spec; works without JavaScript (fixed rows for repeatable items). */
export function WebsiteForm({ websiteId, d = {}, submitLabel }: { websiteId?: string; d?: Input; submitLabel: string }) {
  const svc = [...(d.services ?? []), ...Array(6).fill(null)].slice(0, 6) as Array<{ name: string; description: string; priceCents?: number } | null>;
  const tst = [...(d.testimonials ?? []), ...Array(3).fill(null)].slice(0, 3) as Array<{ quote: string; author: string } | null>;
  return (
    <ActionForm action={saveWebsiteAction} className="space-y-8">
      <CsrfField />
      {websiteId && <input type="hidden" name="websiteId" value={websiteId} />}
      <section className="grid gap-5 md:grid-cols-2">
        <Field label="Business name" name="businessName"><Input id="businessName" name="businessName" required maxLength={80} defaultValue={d.businessName} /></Field>
        <Field label="Industry" name="industry" hint="Chooses the content pack (headlines, FAQs, schema type)."><Select id="industry" name="industry" defaultValue={d.industry ?? 'dentist'}>{INDUSTRIES.map((i) => <option key={i} value={i}>{label(i)}</option>)}</Select></Field>
        <Field label="Tagline (optional)" name="tagline"><Input id="tagline" name="tagline" maxLength={100} defaultValue={d.tagline} /></Field>
        <Field label="Design" name="design"><Select id="design" name="design" defaultValue={d.design ?? 'aurora'}>{DESIGNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      </section>
      <Field label="What you do (20–800 characters)" name="description"><Textarea id="description" name="description" rows={3} required minLength={20} maxLength={800} defaultValue={d.description} /></Field>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Services (at least one)</legend>
        <div className="space-y-3">
          {svc.map((s, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[1fr_2fr_120px]">
              <Input name={`service_${i}_name`} aria-label={`Service ${i + 1} name`} placeholder={`Service ${i + 1}`} maxLength={60} defaultValue={s?.name} />
              <Input name={`service_${i}_description`} aria-label={`Service ${i + 1} description`} placeholder="Short description (10–400 characters)" maxLength={400} defaultValue={s?.description} />
              <Input name={`service_${i}_price`} aria-label={`Service ${i + 1} price`} placeholder="Price (optional)" inputMode="decimal" defaultValue={s?.priceCents ? (s.priceCents / 100).toFixed(2) : ''} />
            </div>
          ))}
        </div>
      </fieldset>
      <section className="grid gap-5 md:grid-cols-3">
        <Field label="Phone" name="phone"><Input id="phone" name="phone" type="tel" required defaultValue={d.phone} /></Field>
        <Field label="Email" name="email"><Input id="email" name="email" type="email" required defaultValue={d.email} /></Field>
        <Field label="Hours (optional)" name="hours"><Input id="hours" name="hours" maxLength={200} placeholder="Mon–Fri 8–6" defaultValue={d.hours} /></Field>
        <Field label="Street address (optional)" name="address"><Input id="address" name="address" maxLength={160} defaultValue={d.address} /></Field>
        <Field label="City" name="city"><Input id="city" name="city" required maxLength={60} defaultValue={d.city} /></Field>
        <Field label="State (2 letters)" name="state"><Input id="state" name="state" required maxLength={2} minLength={2} defaultValue={d.state} /></Field>
      </section>
      <Field label="Service areas (comma separated, optional)" name="serviceAreas" hint="Only areas you really serve. Location pages need unique local content and are capped per month."><Input id="serviceAreas" name="serviceAreas" defaultValue={(d.serviceAreas ?? []).join(', ')} /></Field>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="serviceAreaAttestation" defaultChecked={!!d.serviceAreas?.length} /> I confirm my business serves the areas listed.</label>
      <section className="grid gap-5 md:grid-cols-3">
        <fieldset><legend className="mb-2 text-sm font-semibold">Brand colors</legend><div className="flex gap-3">{[0, 1].map((i) => <input key={i} type="color" name="colors" defaultValue={d.colors?.[i] ?? ['#0B5FFF', '#16A34A'][i]} aria-label={`Brand color ${i + 1}`} className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--color-border)] bg-transparent" />)}</div></fieldset>
        <Field label="Main call to action" name="ctaGoal"><Select id="ctaGoal" name="ctaGoal" defaultValue={d.ctaGoal ?? 'call'}><option value="call">Call us</option><option value="form">Contact form</option><option value="booking">Booking link</option></Select></Field>
        <Field label="Booking link (if chosen)" name="bookingUrl"><Input id="bookingUrl" name="bookingUrl" type="url" placeholder="https://" defaultValue={d.bookingUrl} /></Field>
      </section>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Social links (optional)</legend>
        <div className="grid gap-3 md:grid-cols-3">{['facebook', 'instagram', 'linkedin', 'x', 'yelp', 'google'].map((k) => <Input key={k} name={`social_${k}`} type="url" aria-label={`${k} link`} placeholder={`${k === 'x' ? 'X' : label(k)} https://`} defaultValue={d.social?.[k]} />)}</div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Testimonials (real customers only)</legend>
        <div className="space-y-3">
          {tst.map((t, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-center">
              <Input name={`t_${i}_quote`} aria-label={`Testimonial ${i + 1}`} placeholder="What the customer said" maxLength={400} defaultValue={t?.quote} />
              <Input name={`t_${i}_author`} aria-label={`Testimonial ${i + 1} author`} placeholder="First name, city" maxLength={60} defaultValue={t?.author} />
              <label className="flex gap-2 text-xs"><input type="checkbox" name={`t_${i}_attested`} defaultChecked={!!t} /> Genuine review</label>
            </div>
          ))}
        </div>
      </fieldset>
      <Field label="Licenses / certifications (optional)" name="licenses"><Input id="licenses" name="licenses" maxLength={300} defaultValue={d.licenses} /></Field>
      <SubmitButton pendingText="Building your site…" size="lg">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
