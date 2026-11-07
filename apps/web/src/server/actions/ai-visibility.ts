'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AI_ENGINES } from '@roi/product-engine/ai-visibility';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requireUser } from '../session';
import { assertCan, ForbiddenError } from '../authz';
import { requireCustomer } from '../customer';
import { db } from '../db';
import { audit } from '../audit';
import { rateLimit } from '../rate-limit';

/**
 * Product 11: manual mention checks by staff (for engines without compliant API access) and on-demand reports.
 * A manual check records who entered it and when; one check per question + engine + day (idempotent).
 */
async function csrf(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
    return null;
  } catch (e) {
    if (e instanceof CsrfError) return 'Your session expired. Refresh the page and try again.';
    throw e;
  }
}

const schema = z.object({
  questionId: z.string().min(10),
  engine: z.enum(AI_ENGINES.map((e) => e.key) as [string, ...string[]]),
  mentioned: z.enum(['yes', 'no']),
  position: z.coerce.number().int().min(1).max(50).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  citedSources: z.string().max(1000).optional(),
  answer: z.string().max(4000).optional(),
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordMentionCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await csrf(form);
  if (bad) return { error: bad };
  const s = await requireUser({ roles: ['ADMIN', 'PM', 'MANAGER'] });
  try {
    await assertCan(s.user, 'ai_visibility.manual_entry');
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'You do not have permission to enter checks.' };
    throw e;
  }
  const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== '')));
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` };
  const d = parsed.data;
  const checkedAt = new Date(`${d.checkedOn}T12:00:00Z`);
  if (checkedAt.getTime() > Date.now() + 86_400_000) return { error: 'The check date cannot be in the future.' };
  const q = await db().aiTrackedQuestion.findUnique({ where: { id: d.questionId } });
  if (!q) return { error: 'Question not found.' };
  const sources = (d.citedSources ?? '').split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 20);
  const key = `manual:${q.id}:${d.engine}:${d.checkedOn}`;
  await db().aiMentionCheck.upsert({
    where: { idempotencyKey: key },
    update: { mentioned: d.mentioned === 'yes', position: d.mentioned === 'yes' ? d.position ?? null : null, sentiment: d.sentiment ?? null, answer: d.answer ?? null, citedSources: sources, enteredById: s.user.id },
    create: { questionId: q.id, engine: d.engine, method: 'manual', mentioned: d.mentioned === 'yes', position: d.mentioned === 'yes' ? d.position ?? null : null, sentiment: d.sentiment ?? null, answer: d.answer ?? null, citedSources: sources, checkedAt, enteredById: s.user.id, idempotencyKey: key },
  });
  await audit('ai_visibility.manual_check', { actorId: s.user.id, actorRole: s.user.role, targetType: 'AiTrackedQuestion', targetId: q.id, data: { engine: d.engine, mentioned: d.mentioned, day: d.checkedOn } });
  revalidatePath('/admin/ai-visibility');
  return { ok: 'Check saved.' };
}

export async function requestAiReportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const bad = await csrf(form);
  if (bad) return { error: bad };
  const c = await requireCustomer();
  const rl = await rateLimit(`ai-report:${c.workspaceId}`, 3, 86_400);
  if (!rl.ok) return { error: 'You can create up to 3 reports a day.' };
  const month = new Date().toISOString().slice(0, 7);
  await db().automationJob.create({ data: { type: 'ai-visibility.report', lane: 'preview', priority: 60, workspaceId: c.workspaceId, payload: { workspaceId: c.workspaceId, month }, idempotencyKey: `ai-report:${c.workspaceId}:${month}:${Date.now()}` } });
  return { ok: 'Your report is being prepared. It appears below in a minute.' };
}
