'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireCustomer } from '../customer';
import { audit } from '../audit';
import { db } from '../db';
import { rateLimit } from '../rate-limit';

async function guard(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh and try again.' };
    throw e;
  }
  return null;
}

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const parsed = z.object({
    displayName: z.string().trim().min(2).max(80), industry: z.string().trim().max(60).optional(), description: z.string().trim().max(1000).optional(),
    phone: z.string().trim().max(30).optional(), website: z.string().trim().max(200).optional(), addressLine1: z.string().trim().max(120).optional(),
    city: z.string().trim().max(60).optional(), state: z.string().trim().max(2).optional(), postalCode: z.string().trim().max(10).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `Please check “${String(parsed.error.issues[0].path[0])}”.` };
  await c.data.businessProfile.update({ where: { workspaceId: c.workspaceId }, data: parsed.data });
  await audit('workspace.profile_updated', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'BusinessWorkspace', targetId: c.workspaceId });
  revalidatePath('/dashboard');
  return { ok: 'Business details saved.' };
}

export async function createTicketAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const parsed = z.object({ subject: z.string().trim().min(4).max(140), body: z.string().trim().min(10).max(5000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Add a subject and a message (at least 10 characters).' };
  const rl = await rateLimit(`ticket:${c.user.id}`, 10, 3600);
  if (!rl.ok) return { error: 'You have opened several tickets recently. Please wait a little.' };
  const t = await db().supportTicket.create({
    data: { workspaceId: c.workspaceId, subject: parsed.data.subject, createdById: c.user.id, slaDueAt: new Date(Date.now() + 24 * 3600_000), messages: { create: { authorId: c.user.id, body: parsed.data.body } } },
  });
  await audit('ticket.created', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'SupportTicket', targetId: t.id });
  revalidatePath('/dashboard/support');
  return { ok: `Ticket #${t.number} opened. We reply within one business day.` };
}

export async function addTrackedQuestionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const q = z.string().trim().min(8).max(200).safeParse(form.get('question'));
  if (!q.success) return { error: 'Write the question the way a customer would ask it (8–200 characters).' };
  const count = await c.data.aiTrackedQuestion.count({ where: { active: true } });
  if (count >= 10) return { error: 'You are tracking 10 questions — the free limit. Paid AI Visibility plans track up to 50.' };
  await db().aiTrackedQuestion.create({ data: { workspaceId: c.workspaceId, question: q.data } });
  revalidatePath('/dashboard/ai-visibility');
  return { ok: 'Question added. Mention checks appear here as they are recorded.' };
}

export async function setPostingModeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const id = String(form.get('accountId'));
  const mode = z.enum(['APPROVE_FIRST', 'AUTO_PUBLISH', 'MANAGER_REVIEW']).safeParse(form.get('mode'));
  if (!mode.success) return { error: 'Choose a posting mode.' };
  const account = await c.data.socialAccount.findUnique({ where: { id } });
  if (!account) return { error: 'Account not found.' };
  if (mode.data === 'AUTO_PUBLISH' && form.get('consent') !== 'on') return { error: 'Full Autopilot needs your explicit consent: tick the box to let ROI publish without asking first.' };
  await c.data.socialAccount.update({
    where: { id },
    data: { postingMode: mode.data, autopilot: mode.data === 'AUTO_PUBLISH', autopilotConsentAt: mode.data === 'AUTO_PUBLISH' ? new Date() : account.autopilotConsentAt },
  });
  await audit('social.mode_changed', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'SocialAccount', targetId: id, data: { mode: mode.data, consent: mode.data === 'AUTO_PUBLISH' } });
  revalidatePath('/dashboard/social');
  return { ok: mode.data === 'AUTO_PUBLISH' ? 'Full Autopilot is on. ROI will plan and publish for you. You can pause anytime.' : 'Posting mode saved.' };
}

export async function toggleSocialPauseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const id = String(form.get('accountId'));
  const account = await c.data.socialAccount.findUnique({ where: { id } });
  if (!account) return { error: 'Account not found.' };
  await c.data.socialAccount.update({ where: { id }, data: { paused: !account.paused } });
  if (!account.paused) await db().socialPost.updateMany({ where: { socialAccountId: id, workspaceId: c.workspaceId, status: { in: ['SCHEDULED', 'APPROVED'] } }, data: { status: 'PENDING_APPROVAL' } });
  await audit(account.paused ? 'social.resumed' : 'social.paused', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'SocialAccount', targetId: id });
  revalidatePath('/dashboard/social');
  return { ok: account.paused ? 'Posting resumed.' : 'Paused. Nothing will be published until you resume.' };
}

export async function revokeSessionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  const id = String(form.get('sessionId'));
  await db().userSession.updateMany({ where: { id, userId: c.user.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'user-revoked' } });
  await audit('session.revoked', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'UserSession', targetId: id });
  revalidatePath('/dashboard/settings');
  return { ok: 'That device was signed out.' };
}

export async function requestDeletionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const c = await requireCustomer();
  if (form.get('confirm') !== 'DELETE') return { error: 'Type DELETE to confirm.' };
  const t = await db().supportTicket.create({
    data: { workspaceId: c.workspaceId, subject: 'Privacy: delete my data', priority: 'HIGH', status: 'ESCALATED', createdById: c.user.id, slaDueAt: new Date(Date.now() + 10 * 86400_000), messages: { create: { authorId: c.user.id, body: 'Customer requested deletion of personal data (CCPA/CPRA). Verify identity from the signed-in session, cancel subscriptions, then delete per the retention schedule.' } } },
  });
  await audit('privacy.deletion_requested', { actorId: c.user.id, actorRole: 'CUSTOMER', targetType: 'SupportTicket', targetId: t.id });
  return { ok: `Deletion request received (ticket #${t.number}). We confirm within 10 days and complete it within 45 days as the law requires.` };
}
