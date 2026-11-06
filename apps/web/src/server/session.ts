import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { randomToken, sha256Hex } from '@roi/shared-utils';
import type { RoleName } from '@roi/shared-types';
import { STAFF_ROLES } from '@roi/shared-types';
import { db } from './db';
import { isHttps } from './env';
import { requestMeta } from './request';
import { audit } from './audit';

/**
 * Server-side sessions (spec §6): opaque random token in an HttpOnly, Secure, SameSite=Lax `__Host-` cookie;
 * only its SHA-256 is stored. Idle + absolute timeouts, rotation on privilege change, refresh rotation with
 * reuse detection (a rotated token presented again revokes the whole family).
 */
export const SESSION_COOKIE = () => (isHttps() ? '__Host-roi_session' : 'roi_session');
const STAFF_IDLE_MS = 2 * 60 * 60 * 1000;
const STAFF_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const USER_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const USER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATE_AFTER_MS = 15 * 60 * 1000;
const REUSE_GRACE_MS = 60 * 1000;

const isStaff = (role: RoleName) => STAFF_ROLES.includes(role);

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE(), token, { httpOnly: true, secure: isHttps(), sameSite: 'lax', path: '/', expires });
}

export async function createSession(userId: string, role: RoleName, opts: { twoFactorVerified?: boolean; familyId?: string; impersonatorId?: string } = {}) {
  const token = randomToken(32);
  const now = Date.now();
  const meta = await requestMeta();
  const staff = isStaff(role);
  const session = await db().userSession.create({
    data: {
      tokenHash: sha256Hex(token), familyId: opts.familyId ?? randomToken(12), userId, ip: meta.ip, userAgent: meta.userAgent,
      twoFactorVerifiedAt: opts.twoFactorVerified ? new Date() : null, impersonatorId: opts.impersonatorId,
      idleExpiresAt: new Date(now + (staff ? STAFF_IDLE_MS : USER_IDLE_MS)), expiresAt: new Date(now + (staff ? STAFF_ABSOLUTE_MS : USER_ABSOLUTE_MS)),
    },
  });
  await setCookie(token, session.expiresAt);
  return session;
}

/** Rotate (new token, same family, same absolute expiry). Call after privilege changes and periodically in actions. */
export async function rotateSession(opts: { twoFactorVerified?: boolean } = {}) {
  const current = await getSession();
  if (!current) return null;
  const token = randomToken(32);
  const { session, user } = current;
  const next = await db().$transaction(async (tx) => {
    const n = await tx.userSession.create({
      data: {
        tokenHash: sha256Hex(token), familyId: session.familyId, userId: user.id, ip: session.ip, userAgent: session.userAgent,
        twoFactorVerifiedAt: opts.twoFactorVerified ? new Date() : session.twoFactorVerifiedAt,
        idleExpiresAt: new Date(Date.now() + (isStaff(user.role) ? STAFF_IDLE_MS : USER_IDLE_MS)), expiresAt: session.expiresAt,
        impersonatorId: session.impersonatorId,
      },
    });
    await tx.userSession.update({ where: { id: session.id }, data: { rotatedToId: n.id, revokedAt: new Date(), revokedReason: 'rotated' } });
    return n;
  });
  await setCookie(token, next.expiresAt);
  return next;
}

export async function destroySession(reason = 'logout') {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) {
    await db().userSession.updateMany({ where: { tokenHash: sha256Hex(token), revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }
  jar.delete(SESSION_COOKIE());
}

export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string) {
  await db().userSession.updateMany({ where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { revokedAt: new Date(), revokedReason: reason } });
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  const s = await db().userSession.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!s) return null;
  const now = Date.now();
  if (s.revokedAt) {
    if (s.revokedReason === 'rotated' && now - s.revokedAt.getTime() > REUSE_GRACE_MS) {
      // Reuse of a rotated token → assume theft, revoke the family (spec §6).
      await db().userSession.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'reuse-detected' } });
      await audit('session.reuse_detected', { actorId: s.userId, targetType: 'UserSession', targetId: s.id });
    }
    return null;
  }
  if (s.expiresAt.getTime() < now || s.idleExpiresAt.getTime() < now) return null;
  if (s.user.status !== 'ACTIVE' || s.user.archivedAt) return null;
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await db().userSession.update({
      where: { id: s.id },
      data: { lastSeenAt: new Date(), idleExpiresAt: new Date(now + (isStaff(s.user.role) ? STAFF_IDLE_MS : USER_IDLE_MS)) },
    });
  }
  const { user, ...session } = s;
  return { session, user, shouldRotate: now - s.createdAt.getTime() > ROTATE_AFTER_MS };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getSession>>>['user'];

/**
 * Gate for pages/actions. Staff must have 2FA enrolled and verified in this session; everyone flagged
 * mustChangePassword is sent to change it first.
 */
export async function requireUser(opts: { roles?: RoleName[]; allowPending?: boolean } = {}) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { user, session } = s;
  if (!opts.allowPending) {
    if (user.mustChangePassword) redirect('/account/change-password');
    if (isStaff(user.role) && (!user.twoFactorEnabled || !session.twoFactorVerifiedAt)) redirect('/account/two-factor');
  }
  if (opts.roles && !opts.roles.includes(user.role)) redirect(isStaff(user.role) ? '/admin' : '/dashboard');
  return s;
}

export function homeFor(role: RoleName) {
  return isStaff(role) ? '/admin' : role === 'AFFILIATE' ? '/affiliate' : '/dashboard';
}
