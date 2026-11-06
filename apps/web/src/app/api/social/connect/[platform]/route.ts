import { cookies } from 'next/headers';
import { authorizeUrl, pkcePair, type Platform } from '@roi/social-engine';
import { encryptSecret, randomToken } from '@roi/shared-utils';
import { getSession } from '@/server/session';
import { customerWorkspaceId } from '@/server/authz';
import { db } from '@/server/db';
import { appUrl, isHttps } from '@/server/env';

const FLAGS: Record<string, string> = { FACEBOOK: 'social.facebook', INSTAGRAM: 'social.instagram', TIKTOK: 'social.tiktok', X: 'social.x' };

/** Starts the official OAuth flow (spec Product 9). Hidden platforms redirect back with a notice. */
export async function GET(_: Request, { params }: { params: Promise<{ platform: string }> }) {
  const platform = (await params).platform.toUpperCase() as Platform;
  if (!FLAGS[platform]) return new Response('Unknown platform', { status: 404 });
  const s = await getSession();
  if (!s || s.user.role !== 'CUSTOMER') return Response.redirect(`${appUrl()}/login?next=/dashboard/social`, 302);
  const flag = await db().featureFlag.findUnique({ where: { key: FLAGS[platform] } });
  if (flag?.visibility !== 'LIVE') return Response.redirect(`${appUrl()}/dashboard/social?unavailable=${platform.toLowerCase()}`, 302);
  const ws = await customerWorkspaceId(s.user.id);
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  (await cookies()).set('roi_oauth', encryptSecret(JSON.stringify({ state, verifier, platform, ws, uid: s.user.id }), 'oauth'), { httpOnly: true, secure: isHttps(), sameSite: 'lax', path: '/api/social', maxAge: 600 });
  return Response.redirect(authorizeUrl(platform, `${appUrl()}/api/social/callback/${platform.toLowerCase()}`, state, challenge), 302);
}
