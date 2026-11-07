'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { parseUsdToCents } from '@roi/shared-utils';
import { bookPlanSlug } from '@roi/product-engine/ebook-plan';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireUser } from '../session';
import { assertCan, ForbiddenError } from '../authz';
import { db } from '../db';
import { audit } from '../audit';
import { requestMeta } from '../request';
import { changePrice } from '../pricing';
import { requireCustomer } from '../customer';
import { rateLimit } from '../rate-limit';
import { CheckoutError, createCheckout } from '../commerce';
import { getSetting } from '../catalog';
import { slugifyTitle } from '../ebooks';

/** Product 4 — staff upload/editor and customer purchase (spec §12). */
const ATTESTATION = 'I own or hold a license to sell this book.';

async function staff(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh the page and try again.' } as const;
    throw e;
  }
  const s = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  try {
    await assertCan(s.user, 'ebooks.manage');
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'You do not have permission to manage e-books.' } as const;
    throw e;
  }
  return { user: s.user } as const;
}

const meta = z.object({
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(200).optional(),
  author: z.string().trim().min(2).max(120),
  categoryId: z.string().min(10),
  description: z.string().trim().min(40, 'Write at least a short paragraph (40+ characters).').max(4000),
  language: z.string().trim().min(2).max(10).default('en'),
  tags: z.string().max(300).optional(),
  previewPageCount: z.coerce.number().int().min(1).max(10).default(3),
});

export async function createEbookAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staff(form);
  if ('error' in g) return { error: g.error };
  if (form.get('attest') !== 'on') return { error: 'Confirm that you own or hold a license to sell this book. Uploads without the rights attestation are blocked.' };
  const parsed = meta.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string' && v !== '')));
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` };
  const sourceKey = String(form.get('sourceKey') ?? '');
  if (!/^ebooks\/source\/[0-9a-f-]{36}\.pdf$/.test(sourceKey)) return { error: 'Upload the PDF first.' };
  let priceCents: number;
  try {
    priceCents = parseUsdToCents(String(form.get('price') ?? ''));
  } catch {
    return { error: 'Enter a price like 9.99.' };
  }
  const chapter1 = String(form.get('chapter1StartPage') ?? '').trim();
  const autoChapter1 = chapter1 === '' || chapter1 === 'auto';
  const d = parsed.data;
  let slug = slugifyTitle(d.title);
  if (await db().eBook.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const { ip } = await requestMeta();
  const book = await db().eBook.create({
    data: {
      slug, title: d.title, subtitle: d.subtitle, author: d.author, categoryId: d.categoryId, description: d.description, language: d.language,
      tags: (d.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12), priceCents, sourceKey, chapter1StartPage: autoChapter1 ? 1 : Math.max(1, Number(chapter1) || 1),
      previewPageCount: d.previewPageCount, status: 'DRAFT', uploadedById: g.user.id,
      attestations: { create: { userId: g.user.id, text: ATTESTATION, ip } },
    },
  });
  // Each book is sold through its own plan so prices are versioned, Stripe-synced and margin-guarded.
  const product = await db().product.findUniqueOrThrow({ where: { slug: 'ebook-library' } });
  const plan = await db().productPlan.create({ data: { productId: product.id, slug: bookPlanSlug(book.id), name: d.title.slice(0, 120), published: true, sortOrder: 100 } });
  const price = await changePrice({ planId: plan.id, amountCents: priceCents, interval: 'ONE_TIME', reason: 'Initial book price', overrideReason: String(form.get('overrideReason') ?? '') || undefined, actorId: g.user.id });
  await db().automationJob.create({ data: { type: 'ebook.ingest', lane: 'housekeeping', priority: 40, payload: { ebookId: book.id, autoChapter1 }, idempotencyKey: `ebook-ingest:${book.id}:1`, maxAttempts: 2 } });
  await audit('ebook.uploaded', { actorId: g.user.id, actorRole: g.user.role, targetType: 'EBook', targetId: book.id, data: { pages: null, priceCents, priceAccepted: price.ok } });
  redirect(`/admin/ebooks/${book.id}?created=1${price.ok ? '' : '&price=blocked'}`);
}

export async function updateEbookAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staff(form);
  if ('error' in g) return { error: g.error };
  const id = String(form.get('id'));
  const book = await db().eBook.findUniqueOrThrow({ where: { id } });
  const parsed = meta.safeParse({ ...Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string' && v !== '')) });
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` };
  const chapter1 = Math.max(1, Math.min(book.pageCount ?? 9999, Number(form.get('chapter1StartPage')) || book.chapter1StartPage));
  const d = parsed.data;
  const rerender = chapter1 !== book.chapter1StartPage || d.previewPageCount !== book.previewPageCount;
  await db().eBook.update({ where: { id }, data: { title: d.title, subtitle: d.subtitle ?? null, author: d.author, categoryId: d.categoryId, description: d.description, language: d.language, tags: (d.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12), chapter1StartPage: chapter1, previewPageCount: d.previewPageCount } });
  await db().productPlan.updateMany({ where: { slug: bookPlanSlug(id) }, data: { name: d.title.slice(0, 120) } });
  if (rerender) {
    const n = await db().automationJob.count({ where: { type: 'ebook.ingest', payload: { path: ['ebookId'], equals: id } } });
    await db().automationJob.create({ data: { type: 'ebook.ingest', lane: 'housekeeping', priority: 40, payload: { ebookId: id, autoChapter1: false }, idempotencyKey: `ebook-ingest:${id}:${n + 1}`, maxAttempts: 2 } });
  }
  await audit('ebook.updated', { actorId: g.user.id, actorRole: g.user.role, targetType: 'EBook', targetId: id, data: { rerender, chapter1 } });
  revalidatePath(`/admin/ebooks/${id}`);
  return { ok: rerender ? 'Saved. Preview pages are being re-rendered.' : 'Saved.' };
}

export async function setEbookStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staff(form);
  if ('error' in g) return { error: g.error };
  const id = String(form.get('id'));
  const status = z.enum(['DRAFT', 'LIVE', 'ARCHIVED']).parse(form.get('status'));
  const book = await db().eBook.findUniqueOrThrow({ where: { id }, include: { previewPages: true, attestations: true } });
  if (status === 'LIVE') {
    const plan = await db().productPlan.findFirst({ where: { slug: bookPlanSlug(id) }, include: { prices: { where: { activeTo: null } } } });
    const missing = [
      !book.pageCount && 'the PDF has not been processed yet',
      book.previewPages.length !== Math.min(book.previewPageCount, (book.pageCount ?? 0) - book.chapter1StartPage + 1) && 'preview pages are missing',
      !book.coverKey && 'cover missing',
      !book.attestations.length && 'rights attestation missing',
      !plan?.prices.length && 'no accepted price (check the margin guard)',
    ].filter(Boolean);
    if (missing.length) return { error: `Cannot publish: ${missing.join(', ')}.` };
  }
  await db().eBook.update({ where: { id }, data: { status: status === 'ARCHIVED' ? 'DRAFT' : status, archivedAt: status === 'ARCHIVED' ? new Date() : null } });
  await audit(`ebook.${status.toLowerCase()}`, { actorId: g.user.id, actorRole: g.user.role, targetType: 'EBook', targetId: id });
  revalidatePath(`/admin/ebooks/${id}`);
  revalidatePath('/ebooks');
  return { ok: status === 'LIVE' ? 'Published to the catalog.' : status === 'ARCHIVED' ? 'Archived.' : 'Moved to draft.' };
}

export async function buyEbookAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh the page and try again.' };
    throw e;
  }
  const c = await requireCustomer();
  if (form.get('consent') !== 'on') return { error: 'Please accept the delivery consent, Terms and Refund Policy.' };
  const book = await db().eBook.findUnique({ where: { id: String(form.get('ebookId') ?? '') } });
  if (!book || book.status !== 'LIVE' || book.archivedAt) return { error: 'This book is not available.' };
  const owned = await db().eBookPurchase.findFirst({ where: { ebookId: book.id, workspaceId: c.workspaceId } });
  if (owned) return { error: 'This book is already in your library (Products & downloads).' };
  const plan = await db().productPlan.findFirst({ where: { slug: bookPlanSlug(book.id) } });
  if (!plan) return { error: 'This book has no price yet.' };
  const rl = await rateLimit(`checkout:${c.user.id}`, 20, 3600);
  if (!rl.ok) return { error: 'Too many checkout attempts. Please wait a moment.' };
  let url: string;
  try {
    const consentText = await getSetting<string>('checkout.consentText', 'I agree that delivery begins immediately and accept the Terms and Refund Policy.');
    const r = await createCheckout({ userId: c.user.id, workspaceId: c.workspaceId, planId: plan.id, inputs: { ebookId: book.id }, consentText });
    await audit('checkout.started', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'Order', targetId: r.order.id, data: { ebook: book.slug } });
    url = r.url;
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: 'We could not start checkout. Please try again in a minute.' };
  }
  redirect(url);
}
