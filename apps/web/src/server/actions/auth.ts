'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { encryptSecret } from '@roi/shared-utils';
import { loginSchema, registerSchema } from '@roi/validation';
import type { ActionState } from '@/components/action-form';
import { assertCsrf, CsrfError } from '../csrf';
import { requestMeta } from '../request';
import { rateLimit } from '../rate-limit';
import {
  beginTotpEnrollment, changePassword, confirmTotpEnrollment, createPasswordReset, registerCustomer, resetPassword, verifyCredentials, verifySecondFactor,
} from '../auth-service';
import { createSession, destroySession, getSession, homeFor, revokeAllSessions, rotateSession } from '../session';
import { audit } from '../audit';
import { sendEmail } from '../email';
import { appUrl } from '../env';
import { getFlag } from '../catalog';

import { RC_COOKIE } from '@/lib/constants';
const safeNext = (n: FormDataEntryValue | null) => {
  const v = typeof n === 'string' ? n : '';
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : null;
};

async function guard(form: FormData): Promise<ActionState | null> {
  try {
    await assertCsrf(form.get('csrf'));
    return null;
  } catch (e) {
    if (e instanceof CsrfError) return { error: 'Your session expired. Refresh the page and try again.' };
    throw e;
  }
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter your email and password.' };
  const { ip } = await requestMeta();
  const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip}`, 20, 900), rateLimit(`login:email:${parsed.data.email}`, 8, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: `Too many sign-in attempts. Try again in ${Math.ceil(Math.max(byIp.retryAfterS, byEmail.retryAfterS) / 60)} minutes.` };
  const r = await verifyCredentials(parsed.data.email, parsed.data.password, ip);
  if (!r.ok) {
    return { error: r.code === 'LOCKED' ? 'This account is temporarily locked after several failed attempts. Try again in 15 minutes or reset your password.' : r.code === 'SUSPENDED' ? 'This account is suspended. Contact support.' : 'Email or password is incorrect.' };
  }
  await createSession(r.user.id, r.user.role, { twoFactorVerified: false });
  await audit('auth.login', { actorId: r.user.id, actorRole: r.user.role });
  const next = safeNext(form.get('next'));
  if (r.user.twoFactorEnabled) redirect(`/account/two-factor${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  if (r.user.mustChangePassword) redirect('/account/change-password');
  if (['ADMIN', 'PM', 'MANAGER'].includes(r.user.role)) redirect('/account/two-factor');
  redirect(next ?? homeFor(r.user.role));
}

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  if ((await getFlag('signup')) !== 'LIVE') return { error: 'Registration is temporarily closed.' };
  const parsed = registerSchema.safeParse({
    name: form.get('name'), businessName: form.get('businessName'), email: form.get('email'), password: form.get('password'),
    marketingOk: form.get('marketingOk') === 'on', acceptTerms: form.get('acceptTerms') === 'on',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.path[0] === 'acceptTerms' ? 'Please accept the Terms and Privacy Policy.' : i.path[0] === 'password' ? 'Use at least 12 characters.' : 'Please check this field.';
    return { error: Object.values(fieldErrors)[0], fieldErrors };
  }
  const { ip } = await requestMeta();
  const rl = await rateLimit(`signup:${ip}`, 5, 3600);
  if (!rl.ok) return { error: 'Too many sign-ups from this network. Try again later.' };
  const r = await registerCustomer(parsed.data);
  if (!r.ok) return { error: r.error };
  await audit('auth.register', { actorId: r.userId, actorRole: 'CUSTOMER', targetType: 'BusinessWorkspace', targetId: r.workspaceId });
  await sendEmail(parsed.data.email, 'verify-email', { email: parsed.data.email, link: `${appUrl()}/verify-email?token=${r.verifyToken}` });
  await sendEmail(parsed.data.email, 'welcome', { name: parsed.data.name, businessName: parsed.data.businessName });
  await createSession(r.userId, 'CUSTOMER');
  redirect(safeNext(form.get('next')) ?? '/dashboard?welcome=1');
}

export async function logoutAction(form: FormData) {
  try {
    await assertCsrf(form.get('csrf'));
  } catch {
    redirect('/login');
  }
  const s = await getSession();
  if (s) await audit('auth.logout', { actorId: s.user.id, actorRole: s.user.role });
  await destroySession();
  redirect('/login?signedOut=1');
}

export async function forgotPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' };
  const { ip } = await requestMeta();
  const rl = await rateLimit(`reset:${ip}`, 5, 3600);
  if (!rl.ok) return { error: 'Too many requests. Try again later.' };
  const t = await createPasswordReset(email);
  if (t) {
    await sendEmail(t.email, 'password-reset', { email: t.email, link: `${appUrl()}/reset-password?token=${t.token}` });
    await audit('auth.password_reset_requested', { targetType: 'User', data: { email } });
  }
  return { ok: 'If an account exists for that email, a reset link is on its way. It expires in 30 minutes.' };
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const pw = String(form.get('password') ?? '');
  if (pw !== String(form.get('confirm') ?? '')) return { error: 'The passwords do not match.' };
  const r = await resetPassword(String(form.get('token') ?? ''), pw);
  if (!r.ok) return { error: r.error };
  await audit('auth.password_reset', { actorId: r.userId });
  redirect('/login?reset=1');
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const s = await getSession();
  if (!s) redirect('/login');
  const next = String(form.get('next') ?? '');
  if (next !== String(form.get('confirm') ?? '')) return { error: 'The new passwords do not match.' };
  const r = await changePassword(s.user.id, String(form.get('current') ?? ''), next);
  if (!r.ok) return { error: r.error };
  const rotated = await rotateSession();
  await revokeAllSessions(s.user.id, 'password-changed', rotated?.id);
  await audit('auth.password_changed', { actorId: s.user.id, actorRole: s.user.role });
  if (['ADMIN', 'PM', 'MANAGER'].includes(s.user.role) && (!s.user.twoFactorEnabled || !s.session.twoFactorVerifiedAt)) redirect('/account/two-factor');
  redirect(homeFor(s.user.role));
}

export async function startTotpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const s = await getSession();
  if (!s) redirect('/login');
  const r = await beginTotpEnrollment(s.user.id);
  if (!r.ok) return { error: r.error };
  await audit('auth.2fa_enrollment_started', { actorId: s.user.id, actorRole: s.user.role });
  redirect('/account/two-factor?setup=1');
}

export async function confirmTotpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const s = await getSession();
  if (!s) redirect('/login');
  const r = await confirmTotpEnrollment(s.user.id, String(form.get('code') ?? '').trim());
  if (!r.ok) return { error: r.error };
  await rotateSession({ twoFactorVerified: true });
  await audit('auth.2fa_enabled', { actorId: s.user.id, actorRole: s.user.role });
  // Show recovery codes exactly once: short-lived, encrypted, HttpOnly cookie read by the page.
  (await cookies()).set(RC_COOKIE, encryptSecret(JSON.stringify(r.recoveryCodes), `rc:${s.user.id}`), { httpOnly: true, secure: appUrl().startsWith('https'), sameSite: 'strict', path: '/account', maxAge: 300 });
  redirect('/account/two-factor?done=1');
}

export async function verifyTotpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(form);
  if (g) return g;
  const s = await getSession();
  if (!s) redirect('/login');
  const rl = await rateLimit(`2fa:${s.user.id}`, 10, 900);
  if (!rl.ok) return { error: 'Too many attempts. Wait a few minutes.' };
  const r = await verifySecondFactor(s.user.id, String(form.get('code') ?? ''));
  if (!r.ok) {
    await audit('auth.2fa_failed', { actorId: s.user.id, actorRole: s.user.role });
    return { error: 'That code is not valid. Use the newest 6-digit code or one of your recovery codes.' };
  }
  await rotateSession({ twoFactorVerified: true });
  await audit('auth.2fa_verified', { actorId: s.user.id, actorRole: s.user.role, data: { method: r.method } });
  if (s.user.mustChangePassword) redirect('/account/change-password');
  redirect(safeNext(form.get('next')) ?? homeFor(s.user.role));
}
