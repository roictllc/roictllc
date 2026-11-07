'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { parseUsdToCents, hashPassword, generatePassword } from '@roi/shared-utils';
import type { ActionState } from '@/components/action-form';
import { db } from '../db';
import { assertCsrf, CsrfError } from '../csrf';
import { requireUser, revokeAllSessions } from '../session';
import { assertCan, ForbiddenError } from '../authz';
import { audit } from '../audit';
import { changePrice, setProductVisibility } from '../pricing';
import { refreshIntegrations } from '../integrations';

async function staffGuard(form: FormData, permission: string) {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh and try again.' } as const;
    throw e;
  }
  const { user } = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  try {
    await assertCan(user, permission);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'You do not have permission to do that.' } as const;
    throw e;
  }
  return { user } as const;
}

export async function changePriceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'prices.manage');
  if ('error' in g) return { error: g.error };
  const parsed = z.object({
    planId: z.string().min(10), amount: z.string().trim(), interval: z.enum(['ONE_TIME', 'MONTH', 'YEAR']),
    reason: z.string().trim().min(3, 'Add a short reason for the change.').max(300), overrideReason: z.string().trim().max(300).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let amountCents: number;
  try {
    amountCents = parseUsdToCents(parsed.data.amount);
  } catch {
    return { error: 'Enter a price like 21 or 21.00.' };
  }
  try {
    const r = await changePrice({ ...parsed.data, amountCents, overrideReason: parsed.data.overrideReason || undefined, actorId: g.user.id });
    if (!r.ok) return { error: r.error };
    await audit('price.changed', { actorId: g.user.id, actorRole: g.user.role, targetType: 'ProductPrice', targetId: r.price.id, data: { planId: parsed.data.planId, amountCents, interval: parsed.data.interval, reason: parsed.data.reason, marginBps: r.margin.marginBps, override: parsed.data.overrideReason || null } });
    revalidatePath('/', 'layout');
    return { ok: `Saved version ${r.price.version}: margin ${(r.margin.marginBps / 100).toFixed(1)}%. Live on the site now; existing subscriptions keep their price.` };
  } catch (e) {
    return { error: `Could not save: ${(e as Error).message}` };
  }
}

export async function setVisibilityAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'products.manage');
  if ('error' in g) return { error: g.error };
  const id = String(form.get('productId'));
  const v = z.enum(['HIDDEN', 'COMING_SOON', 'LIVE']).safeParse(form.get('visibility'));
  if (!v.success) return { error: 'Choose a visibility.' };
  const r = await setProductVisibility(id, v.data);
  if (!r.ok) return { error: r.error };
  await audit('product.visibility', { actorId: g.user.id, actorRole: g.user.role, targetType: 'Product', targetId: id, data: { visibility: v.data } });
  revalidatePath('/', 'layout');
  return { ok: `Visibility set to ${v.data.replace('_', ' ').toLowerCase()}.` };
}

export async function updateProductCopyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'products.manage');
  if ('error' in g) return { error: g.error };
  const parsed = z.object({
    productId: z.string().min(10), name: z.string().trim().min(2).max(80), tagline: z.string().trim().min(5).max(160),
    shortDescription: z.string().trim().min(20).max(400), answerFirst: z.string().trim().min(100).max(700), seoTitle: z.string().trim().min(10).max(70), seoDescription: z.string().trim().min(50).max(170),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` };
  const words = parsed.data.answerFirst.split(/\s+/).length;
  if (words < 35 || words > 75) return { error: `The answer-first block should be about 40–60 words (now ${words}).` };
  const { productId, ...data } = parsed.data;
  await db().product.update({ where: { id: productId }, data });
  await audit('product.copy_updated', { actorId: g.user.id, actorRole: g.user.role, targetType: 'Product', targetId: productId });
  revalidatePath('/', 'layout');
  return { ok: 'Saved. The public page shows the new copy now.' };
}

export async function updateCostModelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'prices.manage');
  if ('error' in g) return { error: g.error };
  const int = z.coerce.number().int().min(0).max(100_000_000);
  const parsed = z.object({
    productId: z.string().min(10), computeSecondsExpected: int, computeRateMillicentsPerS: int, storageMillicents: int, emailMillicents: int, domainCostCents: int,
    socialApiMillicentsPerPost: int, postsPerPeriod: int, supportAllowanceCents: int, refundAllowanceBps: int.max(10_000), minMarginBps: int.max(10_000),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join('.')}: enter a whole number.` };
  const { productId, ...data } = parsed.data;
  await db().productCostModel.update({ where: { productId }, data });
  await audit('product.cost_model_updated', { actorId: g.user.id, actorRole: g.user.role, targetType: 'Product', targetId: productId, data });
  return { ok: 'Cost model saved. Margins recalculated.' };
}

export async function refreshIntegrationsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'integrations.manage');
  if ('error' in g) return { error: g.error };
  const r = await refreshIntegrations();
  await audit('integrations.checked', { actorId: g.user.id, actorRole: g.user.role, data: Object.fromEntries(r.map((x) => [x.key, x.status])) });
  revalidatePath('/admin/integrations');
  return { ok: `Checked ${r.length} integrations: ${r.filter((x) => x.status === 'CONNECTED').length} connected.` };
}

export async function setFlagAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'flags.manage');
  if ('error' in g) return { error: g.error };
  const key = String(form.get('key'));
  const v = z.enum(['HIDDEN', 'COMING_SOON', 'LIVE']).parse(form.get('visibility'));
  if (key === 'checkout' && v === 'LIVE') {
    const stripe = await db().integration.findUnique({ where: { key: 'stripe' } });
    if (stripe?.status !== 'CONNECTED') return { error: 'Checkout can only go LIVE after the Stripe integration passes its live check.' };
  }
  await db().featureFlag.update({ where: { key }, data: { visibility: v, updatedById: g.user.id } });
  await audit('flag.changed', { actorId: g.user.id, actorRole: g.user.role, targetType: 'FeatureFlag', targetId: key, data: { visibility: v } });
  revalidatePath('/', 'layout');
  return { ok: `${key} → ${v}` };
}

export async function updateSettingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'settings.manage');
  if ('error' in g) return { error: g.error };
  const key = String(form.get('key'));
  let value: unknown;
  try {
    value = JSON.parse(String(form.get('value')));
  } catch {
    return { error: 'Value must be valid JSON (numbers, true/false, "text", or { … }).' };
  }
  const existing = await db().setting.findUnique({ where: { key } });
  if (!existing) return { error: 'Unknown setting.' };
  if (typeof existing.value !== typeof value && !(existing.value === null)) return { error: `This setting expects a ${typeof existing.value}.` };
  if (key === 'domain.policy') {
    const ok = z.object({ thresholdCents: z.number().int().min(0).max(100_000), handlingFeeCents: z.number().int().min(0).max(10_000), allowPremium: z.boolean() }).safeParse(value);
    if (!ok.success) return { error: 'domain.policy needs thresholdCents, handlingFeeCents (integers) and allowPremium (true/false).' };
  }
  await db().setting.update({ where: { key }, data: { value: value as object, updatedById: g.user.id } });
  await audit('setting.changed', { actorId: g.user.id, actorRole: g.user.role, targetType: 'Setting', targetId: key, data: { from: existing.value, to: value } as Record<string, unknown> });
  revalidatePath('/', 'layout');
  return { ok: `Saved ${key}.` };
}

export async function createStaffAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'users.manage');
  if ('error' in g) return { error: g.error };
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(80), role: z.enum(['PM', 'MANAGER', 'ADMIN', 'AFFILIATE']) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Enter a name, a valid email and a role.' };
  if (await db().user.findUnique({ where: { email: parsed.data.email } })) return { error: 'A user with that email already exists.' };
  const temp = generatePassword(20);
  const u = await db().user.create({ data: { email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, passwordHash: await hashPassword(temp), mustChangePassword: true, emailVerifiedAt: new Date() } });
  if (parsed.data.role === 'MANAGER') await db().managerProfile.create({ data: { userId: u.id } });
  if (parsed.data.role === 'AFFILIATE') await db().affiliateProfile.create({ data: { userId: u.id, code: parsed.data.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) + u.id.slice(-4).toUpperCase(), status: 'APPROVED', approvedAt: new Date() } });
  await audit('user.created', { actorId: g.user.id, actorRole: g.user.role, targetType: 'User', targetId: u.id, data: { role: parsed.data.role } });
  revalidatePath('/admin/users');
  return { ok: `Created ${parsed.data.email}. Temporary password (shown once): ${temp} — they must change it and set up 2FA at first sign-in.` };
}

export async function setUserStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'users.manage');
  if ('error' in g) return { error: g.error };
  const id = String(form.get('userId'));
  const status = z.enum(['ACTIVE', 'SUSPENDED']).parse(form.get('status'));
  if (id === g.user.id) return { error: 'You cannot suspend yourself.' };
  await db().user.update({ where: { id }, data: { status } });
  if (status === 'SUSPENDED') await revokeAllSessions(id, 'suspended');
  await audit('user.status', { actorId: g.user.id, actorRole: g.user.role, targetType: 'User', targetId: id, data: { status } });
  revalidatePath('/admin/users');
  return { ok: `User ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}.` };
}

export async function setUserRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'users.manage');
  if ('error' in g) return { error: g.error };
  const id = String(form.get('userId'));
  const role = z.enum(['ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE']).parse(form.get('role'));
  if (id === g.user.id) return { error: 'You cannot change your own role.' };
  await db().user.update({ where: { id }, data: { role } });
  await revokeAllSessions(id, 'role-changed'); // rotation on privilege change (spec §6)
  await audit('user.role', { actorId: g.user.id, actorRole: g.user.role, targetType: 'User', targetId: id, data: { role } });
  revalidatePath('/admin/users');
  return { ok: `Role changed to ${role}. Their sessions were signed out.` };
}

export async function togglePermissionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await staffGuard(form, 'users.manage');
  if ('error' in g) return { error: g.error };
  const role = z.enum(['PM', 'MANAGER', 'AFFILIATE', 'CUSTOMER']).safeParse(form.get('role'));
  if (!role.success) return { error: 'ADMIN permissions cannot be reduced here.' };
  const key = String(form.get('permission'));
  const exists = await db().rolePermission.findUnique({ where: { roleName_permissionKey: { roleName: role.data, permissionKey: key } } });
  if (exists) await db().rolePermission.delete({ where: { roleName_permissionKey: { roleName: role.data, permissionKey: key } } });
  else await db().rolePermission.create({ data: { roleName: role.data, permissionKey: key } });
  await audit('permission.toggled', { actorId: g.user.id, actorRole: g.user.role, data: { role: role.data, key, granted: !exists } });
  revalidatePath('/admin/users');
  return { ok: `${role.data}: ${key} ${exists ? 'revoked' : 'granted'}.` };
}

export async function retryJobAction(form: FormData) {
  const g = await staffGuard(form, 'jobs.manage');
  if ('error' in g) redirect('/admin/jobs?error=forbidden');
  const id = String(form.get('jobId'));
  const op = String(form.get('op'));
  if (op === 'retry') await db().automationJob.update({ where: { id }, data: { status: 'PENDING', runAt: new Date(), lockedBy: null, leaseUntil: null, lastError: null } });
  if (op === 'cancel') await db().automationJob.update({ where: { id }, data: { status: 'CANCELED' } });
  await audit(`job.${op}`, { actorId: g.user.id, actorRole: g.user.role, targetType: 'AutomationJob', targetId: id });
  revalidatePath('/admin/jobs');
}
