'use server';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { schemas } from '@roi/validation';
import { parseEmployeesCsv, renderSignature, type Company } from '@roi/product-engine/signatures';
import { SIGNATURE_TEMPLATES, type SignatureTemplateSlug } from '@roi/product-engine/signature-templates';
import { storageFromEnv } from '@roi/product-engine/storage';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireCustomer } from '../customer';
import { db } from '../db';
import { rateLimit } from '../rate-limit';
import { audit } from '../audit';
import { CheckoutError, createCheckout } from '../commerce';
import { getSetting } from '../catalog';
import { signDraft, verifyDraft } from '../drafts';

/**
 * Product 8 — Email Signature Suite (spec §12): company block + employee table (CSV) → template → watermarked
 * per-employee previews → pay → ZIP, gallery with copy buttons, install guides. Previews are rendered on request
 * (pure HTML, no worker needed); the paid job builds the clean suite.
 */
export type SignatureState = ActionState & { previews?: Array<{ name: string; html: string }>; draft?: string; count?: number; lineErrors?: string[] };

async function guard(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
    return null;
  } catch (e) {
    if (e instanceof CsrfError) return 'Your session expired. Refresh the page and try again.';
    throw e;
  }
}

const str = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

export async function previewSignaturesAction(_: SignatureState, form: FormData): Promise<SignatureState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const rl = await rateLimit(`sig-preview:${c.user.id}`, 40, 3600);
  if (!rl.ok) return { error: 'Too many previews in a short time. Please wait a few minutes.' };
  const max = await getSetting<number>('signatures.maxEmployees', 50);
  const csv = parseEmployeesCsv(str(form, 'employeesCsv'), max);
  if (csv.errors.length) return { error: 'Some employee rows need fixing.', lineErrors: csv.errors.slice(0, 8).map((e) => (e.line ? `Line ${e.line}: ${e.error}` : e.error)) };
  if (!csv.rows.length) return { error: 'Add at least one employee (paste CSV rows or import the template).' };
  const social: Record<string, string> = {};
  for (const k of ['linkedin', 'facebook', 'instagram', 'x', 'youtube']) if (str(form, `social_${k}`)) social[k] = str(form, `social_${k}`);
  const colors = form.getAll('colors').filter((v): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
  const raw = {
    company: {
      name: str(form, 'companyName'), website: str(form, 'website'), address: str(form, 'address'), logoAssetId: str(form, 'logoAssetId') || undefined,
      useAnimatedLogo: form.get('useAnimatedLogo') === 'on', colors, social, disclaimer: str(form, 'disclaimer'), bannerText: str(form, 'bannerText'), bannerUrl: str(form, 'bannerUrl'),
    },
    templateSlug: str(form, 'templateSlug'),
    employees: csv.rows.map((e) => ({ ...e, title: e.title ?? '', department: e.department ?? '', phone: e.phone ?? '', mobile: e.mobile ?? '', extraLink: e.extraLink ?? '' })),
    utm: form.get('utm') === 'on',
  };
  const parsed = schemas['email-signature-suite'].safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${i.path.join(' → ')}: ${i.message}` };
  }
  const data = parsed.data;
  if (!SIGNATURE_TEMPLATES.some((t) => t.slug === data.templateSlug)) return { error: 'Choose a template.' };
  if (data.company.logoAssetId && !(await c.data.customerAsset.findUnique({ where: { id: data.company.logoAssetId } }))) return { error: 'Upload your logo again.' };

  // Preview logo: the paid animated email GIF if the customer has one, else a small inline copy of the uploaded logo.
  let logoUrl: string | undefined;
  let logoWidth: number | undefined;
  let logoHeight: number | undefined;
  const gif = data.company.useAnimatedLogo ? await db().generatedDeliverable.findFirst({ where: { workspaceId: c.workspaceId, kind: 'email-gif', isPreview: false, publicUrl: { startsWith: 'https://' } }, orderBy: { createdAt: 'desc' } }) : null;
  if (gif) ({ publicUrl: logoUrl, width: logoWidth, height: logoHeight } = { publicUrl: gif.publicUrl!, width: gif.width ?? undefined, height: gif.height ?? undefined });
  else if (data.company.logoAssetId) {
    const asset = await c.data.customerAsset.findUnique({ where: { id: data.company.logoAssetId } });
    const storage = storageFromEnv();
    if (asset && storage) {
      const small = await sharp(await storage.get('private', asset.storageKey)).resize({ width: 240, height: 120, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
      logoUrl = `data:image/png;base64,${small.data.toString('base64')}`;
      logoWidth = Math.round(small.info.width / 2);
      logoHeight = Math.round(small.info.height / 2);
    }
  }
  const company: Company = { name: data.company.name, website: data.company.website, address: data.company.address, colors: data.company.colors, social: data.company.social, disclaimer: data.company.disclaimer, bannerText: data.company.bannerText, bannerUrl: data.company.bannerUrl, logoUrl, logoWidth, logoHeight };
  const watermark = '<table cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#FF2D95;padding:6px 0">ROI PREVIEW · NOT FOR USE</td></tr></table>';
  const previews = data.employees.slice(0, 3).map((e) => ({ name: e.name, html: watermark + renderSignature(data.templateSlug as SignatureTemplateSlug, company, e, { utm: data.utm }).html + watermark }));
  return { ok: `Preview for ${data.employees.length} employee${data.employees.length === 1 ? '' : 's'}.`, previews, draft: signDraft(data, c.workspaceId), count: data.employees.length };
}

export async function buySignaturesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  if (form.get('consent') !== 'on') return { error: 'Please accept the delivery consent, Terms and Refund Policy.' };
  const draft = verifyDraft<object>(String(form.get('draft') ?? ''), c.workspaceId);
  if (!draft) return { error: 'Your preview expired. Make the preview again, then buy.' };
  const product = await db().product.findUniqueOrThrow({ where: { slug: 'email-signature-suite' }, include: { plans: { where: { published: true, archivedAt: null } } } });
  const plan = product.plans.find((p) => p.isDefault) ?? product.plans[0];
  if (!plan) return { error: 'This product has no published plan yet.' };
  const rl = await rateLimit(`checkout:${c.user.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many checkout attempts. Please wait a moment.' };
  let url: string;
  try {
    const consentText = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
    const r = await createCheckout({ userId: c.user.id, workspaceId: c.workspaceId, planId: plan.id, inputs: draft, consentText });
    await audit('checkout.started', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Order', targetId: r.order.id, data: { product: 'email-signature-suite' } });
    url = r.url;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: 'We could not start checkout. Please try again in a minute.' };
  }
  redirect(url);
}
