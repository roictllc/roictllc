import 'server-only';
import { headers } from 'next/headers';

export async function requestMeta() {
  const h = await headers();
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: fwd || h.get('x-real-ip') || h.get('cf-connecting-ip') || null,
    userAgent: h.get('user-agent')?.slice(0, 400) ?? null,
    origin: h.get('origin'),
    host: h.get('x-forwarded-host') ?? h.get('host'),
    nonce: h.get('x-nonce') ?? undefined,
    requestId: h.get('x-request-id') ?? undefined,
  };
}
