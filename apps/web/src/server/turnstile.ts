import 'server-only';

/** Cloudflare Turnstile server check (spec §6). Without TURNSTILE_SECRET_KEY it passes and rate limits still apply (DECISIONS). */
export async function verifyTurnstile(token: FormDataEntryValue | null, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  return !!res && ((await res.json()) as { success?: boolean }).success === true;
}
