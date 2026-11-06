import { createHash, createHmac } from 'node:crypto';

/**
 * Cloudflare R2 (S3-compatible) with AWS Signature V4, no SDK (spec §2.1 Files).
 * presignGet → short-lived download URLs after an ownership check; putObject → worker uploads.
 */
const sha = (d: string | Buffer) => createHash('sha256').update(d).digest('hex');
const hmac = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // override for tests / other S3
  region?: string;
}

export function r2FromEnv(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  return { accountId: env.CLOUDFLARE_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, endpoint: env.R2_ENDPOINT };
}

function signingKey(secret: string, date: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request');
}

function base(cfg: R2Config) {
  return new URL(cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`);
}

export function presignUrl(cfg: R2Config, method: 'GET' | 'PUT', bucket: string, key: string, expiresS = 300, now = new Date(), extraQuery: Record<string, string> = {}) {
  const region = cfg.region ?? 'auto';
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const host = base(cfg).host;
  const path = `/${bucket}/${key.split('/').map(enc).join('/')}`;
  const scope = `${date}/${region}/s3/aws4_request`;
  const q: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`, 'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.min(604800, Math.max(1, expiresS))), 'X-Amz-SignedHeaders': 'host', ...extraQuery,
  };
  const canonicalQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonical = [method, path, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const sig = createHmac('sha256', signingKey(cfg.secretAccessKey, date, region)).update(toSign).digest('hex');
  return `${base(cfg).origin}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}

export async function putObject(cfg: R2Config, bucket: string, key: string, body: Buffer, contentType: string) {
  const url = presignUrl(cfg, 'PUT', bucket, key, 600);
  const res = await fetch(url, { method: 'PUT', body: new Uint8Array(body), headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error(`R2 PUT ${key} failed: HTTP ${res.status}`);
  return { key, size: body.length, sha256: sha(body) };
}
