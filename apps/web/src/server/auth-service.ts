import 'server-only';
import {
  decryptSecret, encryptSecret, generateTotpSecret, hashPassword, passwordProblems, randomToken, sha256Hex, slugify, verifyPassword, verifyTotp,
} from '@roi/shared-utils';
import { db } from './db';

/**
 * Authentication service (spec §6). Pure business logic with explicit inputs so it is testable without HTTP.
 * Cookies/sessions are handled by the calling Server Actions.
 */
let dummyHash: Promise<string> | null = null;
const DUMMY_HASH = () => (dummyHash ??= hashPassword(randomToken(16)));
export const LOCKOUT = { attempts: 8, windowMs: 15 * 60 * 1000 };

export type LoginResult =
  | { ok: true; user: { id: string; role: 'ADMIN' | 'PM' | 'MANAGER' | 'CUSTOMER' | 'AFFILIATE'; twoFactorEnabled: boolean; mustChangePassword: boolean } }
  | { ok: false; code: 'INVALID' | 'LOCKED' | 'SUSPENDED' };

export async function verifyCredentials(emailRaw: string, password: string, ip: string | null): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - LOCKOUT.windowMs);
  const failures = await db().loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } });
  if (failures >= LOCKOUT.attempts) {
    await db().loginAttempt.create({ data: { email, ip, success: false, reason: 'locked' } });
    return { ok: false, code: 'LOCKED' };
  }
  const user = await db().user.findUnique({ where: { email } });
  const valid = await verifyPassword(user?.passwordHash ?? (await DUMMY_HASH()), password); // equalize timing for unknown emails
  if (!user || !valid) {
    await db().loginAttempt.create({ data: { email, ip, success: false, reason: user ? 'bad-password' : 'unknown-email' } });
    return { ok: false, code: 'INVALID' };
  }
  if (user.status !== 'ACTIVE' || user.archivedAt) {
    await db().loginAttempt.create({ data: { email, ip, success: false, reason: 'suspended' } });
    return { ok: false, code: 'SUSPENDED' };
  }
  await db().loginAttempt.create({ data: { email, ip, success: true } });
  await db().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, user: { id: user.id, role: user.role, twoFactorEnabled: user.twoFactorEnabled, mustChangePassword: user.mustChangePassword } };
}

export async function registerCustomer(input: { name: string; businessName: string; email: string; password: string; marketingOk: boolean }) {
  const email = input.email.trim().toLowerCase();
  const problems = passwordProblems(input.password, email);
  if (problems.length) return { ok: false as const, error: problems[0] };
  if (await db().user.findUnique({ where: { email } })) {
    // Do not reveal account existence beyond what the sign-in page already does.
    return { ok: false as const, error: 'An account with this email may already exist. Try signing in or resetting your password.' };
  }
  const passwordHash = await hashPassword(input.password);
  const verifyToken = randomToken(32);
  const result = await db().$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name: input.name.trim(), passwordHash, role: 'CUSTOMER' } });
    let slug = slugify(input.businessName);
    if (await tx.businessWorkspace.findUnique({ where: { slug } })) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const ws = await tx.businessWorkspace.create({ data: { name: input.businessName.trim(), slug, ownerId: user.id } });
    await tx.customer.create({ data: { userId: user.id, workspaceId: ws.id, marketingOk: input.marketingOk } });
    await tx.businessProfile.create({ data: { workspaceId: ws.id, displayName: input.businessName.trim(), email } });
    await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: sha256Hex(verifyToken), expiresAt: new Date(Date.now() + 24 * 3600_000) } });
    return { user, ws };
  });
  return { ok: true as const, userId: result.user.id, workspaceId: result.ws.id, verifyToken };
}

export async function verifyEmailToken(token: string) {
  const t = await db().emailVerificationToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return false;
  await db().$transaction([
    db().emailVerificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db().user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return true;
}

export async function createPasswordReset(emailRaw: string) {
  const user = await db().user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
  if (!user || user.status !== 'ACTIVE') return null;
  const token = randomToken(32);
  await db().passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  return { token, email: user.email };
}

export async function resetPassword(token: string, newPassword: string) {
  const t = await db().passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return { ok: false as const, error: 'This link is invalid or has expired.' };
  const problems = passwordProblems(newPassword, t.user.email);
  if (problems.length) return { ok: false as const, error: problems[0] };
  const passwordHash = await hashPassword(newPassword);
  await db().$transaction([
    db().passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db().user.update({ where: { id: t.userId }, data: { passwordHash, mustChangePassword: false } }),
    db().userSession.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password-reset' } }),
  ]);
  return { ok: true as const, userId: t.userId };
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) return { ok: false as const, error: 'Your current password is incorrect.' };
  if (current === next) return { ok: false as const, error: 'Choose a password different from the current one.' };
  const problems = passwordProblems(next, user.email);
  if (problems.length) return { ok: false as const, error: problems[0] };
  await db().user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  return { ok: true as const };
}

// ── TOTP 2FA ────────────────────────────────────────────────────────────────
export async function beginTotpEnrollment(userId: string) {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabled) return { ok: false as const, error: 'Two-factor authentication is already enabled.' };
  const secret = generateTotpSecret();
  await db().twoFactorSecret.upsert({
    where: { userId }, update: { secretEncrypted: encryptSecret(secret, `totp:${userId}`), enabledAt: null, lastUsedStep: null },
    create: { userId, secretEncrypted: encryptSecret(secret, `totp:${userId}`) },
  });
  return { ok: true as const, secret, email: user.email };
}

export async function pendingTotpSecret(userId: string) {
  const s = await db().twoFactorSecret.findUnique({ where: { userId } });
  return s && !s.enabledAt ? decryptSecret(s.secretEncrypted, `totp:${userId}`) : null;
}

export async function confirmTotpEnrollment(userId: string, code: string) {
  const s = await db().twoFactorSecret.findUnique({ where: { userId } });
  if (!s) return { ok: false as const, error: 'Start setup again.' };
  const secret = decryptSecret(s.secretEncrypted, `totp:${userId}`);
  const step = verifyTotp(secret, code, s.lastUsedStep);
  if (step === null) return { ok: false as const, error: 'That code did not match. Check your phone’s clock and try the newest code.' };
  const codes = Array.from({ length: 10 }, () => {
    const r = randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '7').slice(0, 8);
    return `${r.slice(0, 4)}-${r.slice(4, 8)}`;
  });
  await db().$transaction([
    db().twoFactorSecret.update({ where: { userId }, data: { enabledAt: new Date(), lastUsedStep: step } }),
    db().user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
    db().recoveryCode.deleteMany({ where: { userId } }),
    db().recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256Hex(c) })) }),
  ]);
  return { ok: true as const, recoveryCodes: codes };
}

export async function verifySecondFactor(userId: string, code: string) {
  const s = await db().twoFactorSecret.findUnique({ where: { userId } });
  if (!s?.enabledAt) return { ok: false as const, method: null };
  const trimmed = code.trim().toLowerCase();
  if (/^\d{6}$/.test(trimmed)) {
    const step = verifyTotp(decryptSecret(s.secretEncrypted, `totp:${userId}`), trimmed, s.lastUsedStep);
    if (step === null) return { ok: false as const, method: 'totp' as const };
    await db().twoFactorSecret.update({ where: { userId }, data: { lastUsedStep: step } });
    return { ok: true as const, method: 'totp' as const };
  }
  const rc = await db().recoveryCode.findFirst({ where: { userId, codeHash: sha256Hex(trimmed), usedAt: null } });
  if (!rc) return { ok: false as const, method: 'recovery' as const };
  await db().recoveryCode.update({ where: { id: rc.id }, data: { usedAt: new Date() } });
  return { ok: true as const, method: 'recovery' as const };
}
