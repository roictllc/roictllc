import { cookies } from 'next/headers';
import { exchangeCode, type Platform } from '@roi/social-engine';
import { decryptSecret, encryptSecret, safeEqual } from '@roi/shared-utils';
import { getSession } from '@/server/session';
import { db } from '@/server/db';
import { appUrl } from '@/server/env';
import { audit } from '@/server/audit';

async function profile(platform: Platform, token: string): Promise<{ id: string; handle: string }> {
  const get = async (url: string) => (await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })).json() as Promise<any>;
  const g = process.env.META_GRAPH_VERSION ?? 'v23.0';
  if (platform === 'X') { const r = await get('https://api.x.com/2/users/me'); return { id: r.data.id, handle: r.data.username }; }
  if (platform === 'TIKTOK') { const r = await get('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name'); return { id: r.data.user.open_id, handle: r.data.user.display_name }; }
  const pages = await get(`https://graph.facebook.com/${g}/me/accounts?fields=id,name,instagram_business_account{id,username}`);
  const page = pages.data?.[0];
  if (!page) throw new Error('No Facebook Page found on this account');
  if (platform === 'INSTAGRAM') {
    if (!page.instagram_business_account) throw new Error('No Instagram Business account linked to your Page');
    return { id: page.instagram_business_account.id, handle: page.instagram_business_account.username };
  }
  return { id: page.id, handle: page.name };
}

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const platform = (await params).platform.toUpperCase() as Platform;
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get('roi_oauth')?.value;
  jar.delete('roi_oauth');
  const s = await getSession();
  const back = (q: string) => Response.redirect(`${appUrl()}/dashboard/social?${q}`, 302);
  if (!s || !raw) return back('error=session');
  let st: { state: string; verifier: string; platform: string; ws: string; uid: string };
  try {
    st = JSON.parse(decryptSecret(raw, 'oauth'));
  } catch {
    return back('error=state');
  }
  const state = url.searchParams.get('state') ?? '';
  if (!safeEqual(state, st.state) || st.platform !== platform || st.uid !== s.user.id) return back('error=state');
  const code = url.searchParams.get('code');
  if (!code) return back(`error=${encodeURIComponent(url.searchParams.get('error') ?? 'denied')}`);
  try {
    const t = await exchangeCode(platform, code, `${appUrl()}/api/social/callback/${platform.toLowerCase()}`, st.verifier);
    const p = await profile(platform, t.accessToken);
    const acct = await db().socialAccount.upsert({
      where: { workspaceId_platform_externalId: { workspaceId: st.ws, platform, externalId: p.id } },
      update: { accessTokenEnc: encryptSecret(t.accessToken, `social:${st.ws}`), refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken, `social:${st.ws}`) : null, tokenExpiresAt: t.expiresAt, scopes: t.scopes, status: 'CONNECTED', handle: p.handle },
      create: { workspaceId: st.ws, platform, externalId: p.id, handle: p.handle, accessTokenEnc: encryptSecret(t.accessToken, `social:${st.ws}`), refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken, `social:${st.ws}`) : null, tokenExpiresAt: t.expiresAt, scopes: t.scopes },
    });
    await audit('social.connected', { actorId: s.user.id, actorRole: 'CUSTOMER', targetType: 'SocialAccount', targetId: acct.id, data: { platform } });
    return back(`connected=${platform.toLowerCase()}`);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 80))}`);
  }
}
