'use server';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { schemas } from '@roi/validation';
import { storageFromEnv } from '@roi/product-engine/storage';
import { buildWebsiteVersion, pickHostingProvider } from '@roi/product-engine/websites';
import { domainPolicy } from '@roi/product-engine/domains';
import { registrarFromEnv } from '@roi/integrations/registrar';
import { decideDomainPrice, formatUsd } from '@roi/shared-utils';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireCustomer } from '../customer';
import { db } from '../db';
import { audit } from '../audit';
import { appUrl } from '../env';
import { rateLimit } from '../rate-limit';
import { CheckoutError, createCheckout } from '../commerce';
import { getSetting } from '../catalog';
import { sendEmail } from '../email';

/** Product 5 — builder, versions, publishing, rollback and domains (spec §12, §14). */
async function guard(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
    return null;
  } catch (e) {
    if (e instanceof CsrfError) return 'Your session expired. Refresh the page and try again.';
    throw e;
  }
}
const g = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

function collect(form: FormData) {
  const services = [0, 1, 2, 3, 4, 5].map((i) => ({ name: g(form, `service_${i}_name`), description: g(form, `service_${i}_description`), price: g(form, `service_${i}_price`) }))
    .filter((s) => s.name || s.description)
    .map((s) => ({ name: s.name, description: s.description, ...(s.price && /^\d+(\.\d{1,2})?$/.test(s.price) ? { priceCents: Math.round(Number(s.price) * 100) } : {}) }));
  const testimonials = [0, 1, 2].map((i) => ({ quote: g(form, `t_${i}_quote`), author: g(form, `t_${i}_author`), attested: form.get(`t_${i}_attested`) === 'on' })).filter((t) => t.quote || t.author);
  const social: Record<string, string> = {};
  for (const k of ['facebook', 'instagram', 'linkedin', 'x', 'yelp', 'google']) if (g(form, `social_${k}`)) social[k] = g(form, `social_${k}`);
  return {
    businessName: g(form, 'businessName'), industry: g(form, 'industry'), description: g(form, 'description'), tagline: g(form, 'tagline'),
    services, phone: g(form, 'phone'), email: g(form, 'email'), address: g(form, 'address'), city: g(form, 'city'), state: g(form, 'state').toUpperCase(),
    hours: g(form, 'hours'), serviceAreas: g(form, 'serviceAreas').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30),
    colors: form.getAll('colors').filter((v): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)), design: g(form, 'design') || 'aurora',
    ctaGoal: g(form, 'ctaGoal') || 'call', bookingUrl: g(form, 'bookingUrl'), social, testimonials, licenses: g(form, 'licenses'),
    serviceAreaAttestation: form.get('serviceAreaAttestation') === 'on' ? true : undefined,
  };
}

export async function saveWebsiteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const rl = await rateLimit(`site-build:${c.user.id}`, 60, 3600);
  if (!rl.ok) return { error: 'Too many versions in a short time. Please wait a few minutes.' };
  const raw = collect(form);
  if (raw.testimonials.some((t) => !t.attested)) return { error: 'Testimonials must be real: tick “This is a genuine customer review” for each one, or remove it.' };
  if (raw.serviceAreas.length && !raw.serviceAreaAttestation) return { error: 'Confirm that you really serve the listed areas (no fake locations).' };
  const parsed = schemas['landing-page-hosting'].safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i.path.join(' → ')}: ${i.message}` };
  }
  const storage = storageFromEnv();
  if (!storage) return { error: 'File storage is awaiting configuration, so websites cannot be saved yet.' };
  const websiteId = g(form, 'websiteId') || undefined;
  const { serviceAreaAttestation: _att, testimonials, ...rest } = parsed.data;
  const r = await buildWebsiteVersion(db(), storage, { workspaceId: c.workspaceId, websiteId, input: { ...rest, testimonials: testimonials.map(({ quote, author }) => ({ quote, author })) } as never, actorId: c.user.id, apiOrigin: appUrl() });
  if (!r.ok) return { error: `Quality check failed: ${r.problems.slice(0, 3).join('; ')}` };
  await audit(websiteId ? 'website.version_created' : 'website.created', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Website', targetId: r.websiteId, data: { version: r.version.version, ms: r.ms } });
  redirect(`/dashboard/website/${r.websiteId}?v=${r.version.version}${r.unchanged ? '&unchanged=1' : ''}`);
}

export async function subscribeWebsiteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  if (form.get('consent') !== 'on') return { error: 'Please accept the subscription terms and the Refund Policy.' };
  const site = await c.data.website.findUnique({ where: { id: g(form, 'websiteId') } });
  if (!site) return { error: 'Website not found.' };
  const latest = await db().websiteVersion.findFirst({ where: { websiteId: site.id }, orderBy: { version: 'desc' } });
  if (latest?.notes?.startsWith('NEEDS_REVIEW')) return { error: 'This version is waiting for a quick review by our team because its text is too close to another site. Edit the description or services and save again.' };
  const product = await db().product.findUniqueOrThrow({ where: { slug: 'landing-page-hosting' }, include: { plans: { where: { published: true, archivedAt: null } } } });
  const plan = product.plans.find((p) => p.isDefault) ?? product.plans[0];
  if (!plan) return { error: 'Website hosting has no published plan yet.' };
  let url: string;
  try {
    const consentText = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
    const r = await createCheckout({ userId: c.user.id, workspaceId: c.workspaceId, planId: plan.id, inputs: { websiteId: site.id }, consentText });
    await audit('checkout.started', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Order', targetId: r.order.id, data: { website: site.id } });
    url = r.url;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: 'We could not start checkout. Please try again in a minute.' };
  }
  redirect(url);
}

/** Publish a saved version — also how rollback works (publish an older version). Needs an active subscription. */
export async function publishVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const site = await c.data.website.findUnique({ where: { id: g(form, 'websiteId') } });
  if (!site) return { error: 'Website not found.' };
  const sub = site.subscriptionId ? await db().subscription.findUnique({ where: { id: site.subscriptionId } }) : null;
  if (!sub || !['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status)) return { error: 'Start your website subscription to publish.' };
  const version = await db().websiteVersion.findFirst({ where: { id: g(form, 'versionId'), websiteId: site.id } });
  if (!version) return { error: 'Version not found.' };
  if (version.notes?.startsWith('NEEDS_REVIEW')) return { error: 'This version is waiting for a review by our team.' };
  const rl = await rateLimit(`site-publish:${site.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many publishes in an hour. Please wait.' };
  await db().automationJob.create({ data: { type: 'website.publish', lane: 'paid', priority: 20, workspaceId: c.workspaceId, payload: { websiteId: site.id, versionId: version.id }, idempotencyKey: `publish:${site.id}:${version.id}:${Date.now()}`, maxAttempts: 3 } });
  await audit('website.publish_requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Website', targetId: site.id, data: { version: version.version } });
  revalidatePath(`/dashboard/website/${site.id}`);
  return { ok: `Publishing version ${version.version}. This page updates when it is live.` };
}

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function connectDomainAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const site = await c.data.website.findUnique({ where: { id: g(form, 'websiteId') } });
  if (!site) return { error: 'Website not found.' };
  const name = g(form, 'domain').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!HOST.test(name)) return { error: 'Enter a domain like example.com or www.example.com.' };
  if (name.endsWith(new URL(appUrl()).hostname)) return { error: 'Use your own domain.' };
  const existing = await db().domain.findUnique({ where: { name } });
  if (existing && existing.workspaceId !== c.workspaceId) return { error: 'This domain is connected to another account. Contact support if it is yours.' };
  const verification = { txtName: `_roi-verify.${name}`, txtValue: `roi-verify=${randomBytes(12).toString('hex')}`, requestedAt: new Date().toISOString() };
  await db().domain.upsert({ where: { name }, update: { websiteId: site.id, verification }, create: { name, workspaceId: c.workspaceId, websiteId: site.id, status: 'EXTERNAL', external: true, coveredByRoi: false, verification } });
  await audit('domain.connect_requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Domain', targetId: name });
  revalidatePath(`/dashboard/website/${site.id}`);
  return { ok: 'Add the two DNS records shown below at your domain provider, then click Verify.' };
}

export async function verifyDomainAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const d = await c.data.domain.findUnique({ where: { name: g(form, 'domain') } });
  if (!d?.websiteId) return { error: 'Domain not found.' };
  const v = (d.verification ?? {}) as { txtName?: string; txtValue?: string; verifiedAt?: string };
  const rl = await rateLimit(`domain-verify:${d.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many checks. DNS changes can take up to an hour — try again later.' };
  const records = await resolveTxt(v.txtName!).catch(() => [] as string[][]);
  if (!records.some((r) => r.join('') === v.txtValue)) return { error: `We could not find the TXT record yet. DNS changes can take up to an hour. Expected ${v.txtName} = ${v.txtValue}` };
  const site = await db().website.findUniqueOrThrow({ where: { id: d.websiteId } });
  let detail = '';
  if (site.status === 'LIVE') {
    const provider = await pickHostingProvider(db()).catch(() => null);
    if (provider) {
      const r = await provider.attachDomain({ projectName: (site.design as { projectName?: string }).projectName ?? '' }, d.name);
      detail = r.detail;
    }
  }
  await db().domain.update({ where: { id: d.id }, data: { verification: { ...v, verifiedAt: new Date().toISOString() } } });
  if (site.status === 'LIVE') {
    await db().website.update({ where: { id: site.id }, data: { liveUrl: `https://${d.name}` } });
    await sendEmail(c.user.email, 'website-live', { domain: d.name, link: `https://${d.name}` });
  }
  await audit('domain.verified', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Domain', targetId: d.name });
  // Rebuild so canonical URLs, Open Graph, sitemap and schema use the domain; republish if the site is live.
  const storage = storageFromEnv();
  const input = (site.content as { input?: object }).input;
  if (storage && input) {
    const r = await buildWebsiteVersion(db(), storage, { workspaceId: c.workspaceId, websiteId: site.id, input: input as never, actorId: c.user.id, apiOrigin: appUrl(), notes: `Domain ${d.name} connected` });
    if (r.ok && !r.unchanged && site.status === 'LIVE' && site.subscriptionId) {
      await db().automationJob.create({ data: { type: 'website.publish', lane: 'paid', priority: 20, workspaceId: c.workspaceId, payload: { websiteId: site.id, versionId: r.version.id }, idempotencyKey: `publish:${site.id}:${r.version.id}:domain`, maxAttempts: 3 } });
    }
  }
  revalidatePath(`/dashboard/website/${site.id}`);
  return { ok: `Verified. ${detail}`.trim() };
}

/**
 * Register a domain through ROI (spec §14). Domains under $15/year (the higher of first-year and renewal price) are
 * included while the website subscription is active; the customer is the registrant (their contact details).
 */
export async function registerDomainAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const site = await c.data.website.findUnique({ where: { id: g(form, 'websiteId') } });
  if (!site) return { error: 'Website not found.' };
  const sub = site.subscriptionId ? await db().subscription.findUnique({ where: { id: site.subscriptionId } }) : null;
  if (!sub || !['ACTIVE', 'TRIALING'].includes(sub.status)) return { error: 'Start your website subscription first — included domains are part of it.' };
  if (await c.data.domain.findFirst({ where: { websiteId: site.id, status: { in: ['ACTIVE', 'REGISTERING'] } } })) return { error: 'This website already has a domain.' };
  const registrar = registrarFromEnv();
  if (!registrar) return { error: 'Domain registration is awaiting configuration.' };
  const name = g(form, 'domain').toLowerCase();
  if (!HOST.test(name)) return { error: 'Invalid domain.' };
  const rl = await rateLimit(`domain-register:${c.workspaceId}`, 5, 86_400);
  if (!rl.ok) return { error: 'Too many registration attempts today.' };
  const quote = await registrar.search(name);
  const decision = decideDomainPrice(quote, await domainPolicy(db()));
  if (!decision.ok) return { error: decision.message };
  if (!quote.apiRegisterable) return { error: `${name} can only be registered manually. Contact support and we will help.` };
  if (!decision.coveredByRoi) return { error: `${name} costs ${formatUsd(decision.effectiveCents)}/year, so you pay it in full. Paid domain checkout opens soon — or choose a domain under $15/year, which is included.` };
  const phone = g(form, 'phone').replace(/[^\d+]/g, '');
  const contact = { firstName: g(form, 'firstName'), lastName: g(form, 'lastName'), organization: g(form, 'organization') || undefined, email: c.user.email, phone: phone.startsWith('+') ? phone.replace(/^\+1/, '+1.') : `+1.${phone.replace(/^1/, '')}`, address1: g(form, 'address1'), city: g(form, 'city'), state: g(form, 'state').toUpperCase(), zip: g(form, 'zip'), country: 'US' };
  if (!contact.firstName || !contact.lastName || !contact.address1 || !contact.city || !/^[A-Z]{2}$/.test(contact.state) || !/^\d{5}(-\d{4})?$/.test(contact.zip) || contact.phone.length < 12) return { error: 'Fill in the registrant contact (ICANN requires a real name, US address, ZIP and phone).' };
  if (form.get('registrantConsent') !== 'on') return { error: 'Confirm that you will be the legal registrant.' };
  if (await db().domain.findUnique({ where: { name } })) return { error: 'This domain is already being registered.' };
  const d = await db().domain.create({ data: { name, workspaceId: c.workspaceId, websiteId: site.id, status: 'REGISTERING', registrar: registrar.name, coveredByRoi: true, external: false, verification: { quotedFirstYearCents: quote.firstYearCents, quotedRenewalCents: quote.renewalCents, quotedAt: new Date().toISOString() } } });
  await db().automationJob.create({ data: { type: 'domain.register', lane: 'paid', priority: 15, workspaceId: c.workspaceId, payload: { domainId: d.id, contact }, idempotencyKey: `domain-register:${d.id}`, maxAttempts: 3 } });
  await audit('domain.register_requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Domain', targetId: name, data: { firstYearCents: quote.firstYearCents, renewalCents: quote.renewalCents, covered: true } });
  revalidatePath(`/dashboard/website/${site.id}`);
  return { ok: `Registering ${name}. This takes about a minute; DNS then needs a few minutes to a few hours.` };
}
