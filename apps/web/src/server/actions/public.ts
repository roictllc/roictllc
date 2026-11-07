'use server';
import { redirect } from 'next/navigation';
import { runAiVisibilityAudit, SsrfError } from '@roi/seo-engine';
import { schemas } from '@roi/validation';
import { randomToken } from '@roi/shared-utils';
import type { ActionState } from '@/components/action-form';
import { db } from '../db';
import { assertCsrf, CsrfError } from '../csrf';
import { requestMeta } from '../request';
import { rateLimit } from '../rate-limit';
import { verifyTurnstile } from '../turnstile';
import { sendEmail } from '../email';
import { appUrl } from '../env';
import { getFlag } from '../catalog';
import { getSession } from '../session';
import { customerWorkspaceId } from '../authz';

async function guard(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
    return null;
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh the page and try again.' };
    throw e;
  }
}

export async function runAuditAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  if ((await getFlag('ai_visibility.free_audit')) !== 'LIVE') return { error: 'The free audit is temporarily unavailable.' };
  const raw = Object.fromEntries(form);
  let url = String(raw.url ?? '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  const parsed = schemas['ai-visibility-audit'].safeParse({ ...raw, url });
  if (!parsed.success) return { error: `Please check “${String(parsed.error.issues[0].path[0])}”.` };
  const { ip } = await requestMeta();
  if (!(await verifyTurnstile(form.get('cf-turnstile-response'), ip))) return { error: 'Please complete the security check.' };
  const rl = await rateLimit(`audit:${ip}`, 6, 3600);
  if (!rl.ok) return { error: `You have run several audits recently. Try again in ${Math.ceil(rl.retryAfterS / 60)} minutes.` };

  const s = await getSession();
  const workspaceId = s && s.user.role === 'CUSTOMER' ? await customerWorkspaceId(s.user.id) : null;
  const audit = await db().aiVisibilityAudit.create({
    data: { businessName: parsed.data.businessName, city: parsed.data.city, category: parsed.data.category, url: parsed.data.url, email: parsed.data.email, status: 'RUNNING', shareToken: randomToken(18), workspaceId },
  });
  try {
    const r = await runAiVisibilityAudit(parsed.data);
    await db().aiVisibilityAudit.update({ where: { id: audit.id }, data: { status: 'COMPLETED', score: r.score, breakdown: r.breakdown, fixes: { checks: r.checks, fixes: r.fixes.map((f) => f.id), fetched: r.fetched } as object } });
    if (parsed.data.email) {
      await sendEmail(parsed.data.email, 'ai-audit-ready', { businessName: parsed.data.businessName, score: String(r.score), link: `${appUrl()}/ai-visibility/report/${audit.shareToken}` });
      await db().emailSubscriber.upsert({ where: { email: parsed.data.email.toLowerCase() }, update: {}, create: { email: parsed.data.email.toLowerCase(), status: 'UNSUBSCRIBED', tags: ['ai-audit-lead'], unsubscribeToken: randomToken(18) } });
    }
  } catch (e) {
    const msg = e instanceof SsrfError ? 'That address cannot be checked (it points to a private or unsupported location).' : 'We could not reach that website. Check the address and try again.';
    await db().aiVisibilityAudit.update({ where: { id: audit.id }, data: { status: 'FAILED', fixes: { error: msg } } });
    return { error: msg };
  }
  redirect(`/ai-visibility/report/${audit.shareToken}`);
}

export async function contactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  if (String(form.get('website') ?? '')) return { ok: 'Thanks! We will reply soon.' }; // honeypot
  const parsed = schemas.contact.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `Please check “${String(parsed.error.issues[0].path[0])}”.` };
  const { ip } = await requestMeta();
  if (!(await verifyTurnstile(form.get('cf-turnstile-response'), ip))) return { error: 'Please complete the security check.' };
  const rl = await rateLimit(`contact:${ip}`, 5, 3600);
  if (!rl.ok) return { error: 'Too many messages from this network. Try again later.' };
  await db().contactMessage.create({ data: { ...parsed.data, ip } });
  await sendEmail('roictllc@gmail.com', 'admin-alert', { title: `New ${parsed.data.topic} message from ${parsed.data.name}`, message: `${parsed.data.email}${parsed.data.company ? ` · ${parsed.data.company}` : ''}\n\n${parsed.data.message}` });
  return { ok: 'Thanks! Your message reached our team. We usually reply within one business day.' };
}

export async function takedownAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const parsed = schemas.takedown.safeParse({ ...Object.fromEntries(form), goodFaith: form.get('goodFaith') === 'on', accuracy: form.get('accuracy') === 'on' });
  if (!parsed.success) return { error: `Please complete “${String(parsed.error.issues[0].path[0])}” — all statements are required for a valid notice.` };
  const { ip } = await requestMeta();
  const rl = await rateLimit(`takedown:${ip}`, 5, 3600);
  if (!rl.ok) return { error: 'Too many submissions. Try again later.' };
  const d = parsed.data;
  const t = await db().takedown.create({ data: { kind: d.kind, claimantName: d.claimantName, claimantEmail: d.claimantEmail, claimantAddress: d.claimantAddress, url: d.url, workDescription: d.workDescription, statements: { goodFaith: true, accuracy: true, ip }, signature: d.signature } });
  await sendEmail('roictllc@gmail.com', 'admin-alert', { title: `${d.kind === 'DMCA_NOTICE' ? 'DMCA notice' : 'Counter-notice'} received`, message: `${d.claimantName} <${d.claimantEmail}> about ${d.url}. Reference ${t.id}.` });
  return { ok: `Received. Reference ${t.id}. We review notices promptly and will reply by email.` };
}
