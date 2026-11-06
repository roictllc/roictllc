import { headers } from 'next/headers';

/** Cloudflare Turnstile widget (spec §6). Renders nothing until TURNSTILE_SITE_KEY is configured. */
export async function Turnstile() {
  const key = process.env.TURNSTILE_SITE_KEY;
  if (!key) return null;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <div className="cf-turnstile" data-sitekey={key} data-theme="dark" />
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
    </>
  );
}
