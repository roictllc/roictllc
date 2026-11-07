import { db } from '@/server/db';

/**
 * Caddy on-demand TLS gate (infrastructure/caddy/Caddyfile `ask`): a certificate is issued only for verified customer
 * domains attached to a published site, so random hostnames pointed at the server cannot trigger issuance.
 */
export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get('domain') ?? '').toLowerCase().replace(/\.$/, '');
  if (!name || name.length > 253) return new Response('no', { status: 400 });
  const d = await db().domain.findUnique({ where: { name }, include: { website: { select: { status: true } } } });
  const verified = !!(d?.verification as { verifiedAt?: string } | null)?.verifiedAt || d?.status === 'ACTIVE';
  const ok = !!d && verified && !!d.website && ['LIVE', 'SUSPENDED', 'PUBLISHING'].includes(d.website.status);
  return new Response(ok ? 'ok' : 'no', { status: ok ? 200 : 404 });
}
