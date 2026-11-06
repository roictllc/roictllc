import { createHash, randomBytes } from 'node:crypto';

/**
 * Official OAuth endpoints per platform (spec Product 9). Endpoint versions are configurable because platforms
 * version their APIs; verify at deploy time and record in documentation/products/social.md.
 */
export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X';
export interface ProviderConfig {
  platform: Platform;
  integration: 'meta' | 'tiktok' | 'x';
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: string;
  pkce: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
  clientIdParam: string;
}

const graph = () => process.env.META_GRAPH_VERSION ?? 'v23.0';

export function providerConfig(p: Platform): ProviderConfig {
  switch (p) {
    case 'FACEBOOK':
    case 'INSTAGRAM':
      return {
        platform: p, integration: 'meta', authorizeUrl: `https://www.facebook.com/${graph()}/dialog/oauth`, tokenUrl: `https://graph.facebook.com/${graph()}/oauth/access_token`,
        scopes: p === 'FACEBOOK' ? ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'read_insights', 'business_management'] : ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list', 'business_management'],
        scopeSeparator: ',', pkce: false, clientIdEnv: 'META_APP_ID', clientSecretEnv: 'META_APP_SECRET', clientIdParam: 'client_id',
      };
    case 'TIKTOK':
      return { platform: p, integration: 'tiktok', authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: ['user.info.basic', 'video.publish', 'video.list'], scopeSeparator: ',', pkce: true, clientIdEnv: 'TIKTOK_CLIENT_KEY', clientSecretEnv: 'TIKTOK_CLIENT_SECRET', clientIdParam: 'client_key' };
    case 'X':
      return { platform: p, integration: 'x', authorizeUrl: 'https://x.com/i/oauth2/authorize', tokenUrl: 'https://api.x.com/2/oauth2/token', scopes: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'], scopeSeparator: ' ', pkce: true, clientIdEnv: 'X_CLIENT_ID', clientSecretEnv: 'X_CLIENT_SECRET', clientIdParam: 'client_id' };
  }
}

export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(p: Platform, redirectUri: string, state: string, challenge?: string, env: NodeJS.ProcessEnv = process.env) {
  const c = providerConfig(p);
  const clientId = env[c.clientIdEnv];
  if (!clientId) throw new Error(`${c.clientIdEnv} not configured`);
  const q = new URLSearchParams({ [c.clientIdParam]: clientId, redirect_uri: redirectUri, response_type: 'code', scope: c.scopes.join(c.scopeSeparator), state });
  if (c.pkce && challenge) {
    q.set('code_challenge', challenge);
    q.set('code_challenge_method', 'S256');
  }
  return `${c.authorizeUrl}?${q}`;
}

export async function exchangeCode(p: Platform, code: string, redirectUri: string, verifier: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const c = providerConfig(p);
  const id = env[c.clientIdEnv]!;
  const secret = env[c.clientSecretEnv]!;
  const body = new URLSearchParams({ [c.clientIdParam]: id, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (c.pkce && verifier) body.set('code_verifier', verifier);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (p === 'X') headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  const res = await fetch(c.tokenUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; open_id?: string; error?: unknown };
  if (!res.ok || !json.access_token) throw new Error(`Token exchange failed for ${p}`);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null, scopes: (json.scope ?? '').split(/[ ,]+/).filter(Boolean), openId: json.open_id };
}
