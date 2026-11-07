'use server';
import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { schemas } from '@roi/validation';
import { previewInputHash } from '@roi/product-engine/intake';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireCustomer } from '../customer';
import { db } from '../db';
import { rateLimit } from '../rate-limit';
import { requestMeta } from '../request';
import { verifyTurnstile } from '../turnstile';
import { audit } from '../audit';
import { CheckoutError, createCheckout } from '../commerce';
import { getSetting } from '../catalog';
import { dailyPreviewLimit, isCreateSlug, previewAvailability, type CreateSlug } from '../previews';

/**
 * Products 1–3 customer flow (spec §12): form → server validation → cheap watermarked preview job → choose → pay.
 * Every field is validated with the same zod schema the form is generated from (@roi/validation).
 */
async function guard(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return 'Your session expired. Refresh the page and try again.';
    throw e;
  }
  return null;
}

function fieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? 'form')] ??= i.message;
  return out;
}

async function previewGate(slug: CreateSlug, form: FormData) {
  const c = await requireCustomer();
  if (!c.user.emailVerifiedAt) return { error: 'Please verify your email first: free previews need a verified account.' } as const;
  const avail = await previewAvailability(slug);
  if (!avail.ok) return { error: avail.reason } as const;
  const meta = await requestMeta();
  if (!(await verifyTurnstile(form.get('cf-turnstile-response'), meta.ip))) return { error: 'Please complete the security check.' } as const;
  const limit = await dailyPreviewLimit(slug);
  const rl = await rateLimit(`preview:${slug}:${c.user.id}`, limit, 86_400);
  if (!rl.ok) return { error: `You have used today’s ${limit} free previews. More open in ${Math.ceil(rl.retryAfterS / 3600)} h.` } as const;
  const ipRl = await rateLimit(`preview-ip:${meta.ip ?? 'unknown'}`, 40, 86_400);
  if (!ipRl.ok) return { error: 'Too many previews from this network today.' } as const;
  return { c } as const;
}

function collect(form: FormData, slug: CreateSlug) {
  const g = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const colors = (k: string) => form.getAll(k).filter((v): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
  if (slug === 'animated-gif-logo') return { logoAssetId: g('logoAssetId'), style: g('style'), background: g('background'), backgroundColor: g('background') === 'solid' ? g('backgroundColor') : undefined, loopSpeed: g('loopSpeed') || 'normal', tagline: g('tagline') ?? '', effectColors: colors('effectColors') };
  if (slug === 'logo-revival') return { logoAssetId: g('logoAssetId'), output: g('output'), logoType: g('logoType'), notes: g('notes') ?? '' };
  return { companyName: g('companyName'), tagline: g('tagline') ?? '', category: g('category'), colors: colors('colors'), style: g('style'), avoid: g('avoid') ?? '' };
}

/** P1 + P2: validate, reuse a cached preview for identical inputs, otherwise queue a preview job. */
export async function startUploadPreviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const slug = String(form.get('product'));
  if (slug !== 'animated-gif-logo' && slug !== 'logo-revival') return { error: 'Unknown product.' };
  const parsed = schemas[slug].safeParse(collect(form, slug));
  if (!parsed.success) return { error: 'Please check the highlighted fields.', fieldErrors: fieldErrors(parsed.error.issues) };
  const gate = await previewGate(slug, form);
  if ('error' in gate) return { error: gate.error };
  const { c } = gate;
  const inputs = parsed.data as Record<string, unknown> & { logoAssetId: string };
  const asset = await c.data.customerAsset.findUnique({ where: { id: inputs.logoAssetId } });
  if (!asset || asset.scanStatus !== 'CLEAN') return { error: 'Upload your logo again — we could not find a clean copy.', fieldErrors: { logoAssetId: 'Upload a logo' } };
  const upload = await db().logoUpload.findFirst({ where: { assetId: asset.id, workspaceId: c.workspaceId }, orderBy: { createdAt: 'desc' } });
  if (!upload) return { error: 'Upload your logo again.' };
  const { logoAssetId: _a, ...options } = inputs;
  const hash = previewInputHash(slug, asset.sha256, options);
  const cached = await db().logoRender.findFirst({ where: { inputHash: hash, isPreview: true, deliverableId: { not: null }, upload: { workspaceId: c.workspaceId } }, orderBy: { createdAt: 'desc' } });
  let renderId = cached?.id;
  if (!renderId) {
    const render = await db().logoRender.create({ data: { uploadId: upload.id, style: String(inputs.style ?? inputs.output ?? 'revival'), isPreview: true, inputHash: hash, params: { product: slug, inputs } as object } });
    renderId = render.id;
    await db().automationJob.create({ data: { type: `preview.${slug}`, lane: 'preview', priority: 50, workspaceId: c.workspaceId, payload: { renderId, inputs } as object, idempotencyKey: `preview:${renderId}`, maxAttempts: 2 } });
  }
  await audit('preview.requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'LogoRender', targetId: renderId, data: { product: slug, cached: !!cached } });
  redirect(`/dashboard/create/${slug}?r=${renderId}`);
}

/** P3: three concepts from the brief. */
export async function startConceptsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const parsed = schemas['logo-generator'].safeParse(collect(form, 'logo-generator'));
  if (!parsed.success) return { error: 'Please check the highlighted fields.', fieldErrors: fieldErrors(parsed.error.issues) };
  const gate = await previewGate('logo-generator', form);
  if ('error' in gate) return { error: gate.error };
  const { c } = gate;
  const requestId = randomBytes(9).toString('base64url');
  await db().automationJob.create({ data: { type: 'preview.logo-generator', lane: 'preview', priority: 50, workspaceId: c.workspaceId, payload: { requestId, inputs: parsed.data } as object, idempotencyKey: `preview:concepts:${requestId}`, maxAttempts: 2 } });
  await audit('preview.requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'LogoConceptRequest', targetId: requestId, data: { product: 'logo-generator' } });
  redirect(`/dashboard/create/logo-generator?req=${requestId}`);
}

/**
 * Buy what was previewed. Inputs are taken from the stored preview (never from the client), so the paid job renders
 * exactly what the customer saw — just clean and full size.
 */
export async function buyPreviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await guard(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  if (form.get('consent') !== 'on') return { error: 'Please accept the delivery consent, Terms and Refund Policy.' };
  const slug = String(form.get('product'));
  if (!isCreateSlug(slug)) return { error: 'Unknown product.' };
  let inputs: object;
  let planId = String(form.get('planId') ?? '');
  if (slug === 'logo-generator') {
    const concept = await c.data.logoConcept.findUnique({ where: { id: String(form.get('conceptId') ?? '') } });
    if (!concept) return { error: 'Choose one of your three concepts.' };
    if (concept.purchased) return { error: 'You already bought this concept — find it under Products & downloads.' };
    inputs = { conceptId: concept.id };
  } else {
    const render = await db().logoRender.findFirst({ where: { id: String(form.get('renderId') ?? ''), upload: { workspaceId: c.workspaceId }, deliverableId: { not: null } } });
    if (!render) return { error: 'Make a preview first.' };
    inputs = (render.params as { inputs: object }).inputs;
  }
  const product = await db().product.findUniqueOrThrow({ where: { slug }, include: { plans: { where: { published: true, archivedAt: null } } } });
  if (!product.plans.some((p) => p.id === planId)) planId = (product.plans.find((p) => p.isDefault) ?? product.plans[0])?.id ?? '';
  const rl = await rateLimit(`checkout:${c.user.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many checkout attempts. Please wait a moment.' };
  let url: string;
  try {
    const consentText = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
    const r = await createCheckout({ userId: c.user.id, workspaceId: c.workspaceId, planId, inputs, consentText });
    await audit('checkout.started', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Order', targetId: r.order.id, data: { product: slug } });
    url = r.url;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: 'We could not start checkout. Please try again in a minute.' };
  }
  redirect(url);
}
