/**
 * Integration registry (spec §0.2, §3, §24A). Each integration lists its env variable NAMES, what it unlocks,
 * the one owner step needed, and a live health check. Status = AWAITING_CONFIGURATION while any variable is missing;
 * CONNECTED only after the live check passes. Features gated by an integration stay HIDDEN/COMING_SOON until then.
 */
export interface IntegrationDef {
  key: string;
  name: string;
  requiredEnv: string[];
  unlocks: string[];
  ownerStep: string;
  check?: (env: NodeJS.ProcessEnv) => Promise<{ ok: boolean; detail: string }>;
}

async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'database', name: 'PostgreSQL (Neon)', requiredEnv: ['DATABASE_URL'], unlocks: ['Everything'],
    ownerStep: 'Already provisioned: Neon project blue-forest-78059884.',
  },
  {
    key: 'stripe', name: 'Stripe payments', requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY'],
    unlocks: ['Checkout for every product', 'Subscriptions', 'Refunds', 'Customer portal'],
    ownerStep: 'Create a Stripe sandbox key (sk_test_…) for testing and a restricted live key for launch; ROI creates the webhook endpoint via API.',
    check: async (env) => {
      const r = await http('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
      return { ok: r.ok, detail: r.ok ? `Stripe reachable (${env.STRIPE_SECRET_KEY?.startsWith('sk_live') || env.STRIPE_SECRET_KEY?.startsWith('rk_live') ? 'live' : 'test'} mode)` : `HTTP ${r.status}` };
    },
  },
  {
    key: 'resend', name: 'Resend email', requiredEnv: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'EMAIL_FROM'],
    unlocks: ['Transactional email', 'Deliverable emails', 'Marketing campaigns'],
    ownerStep: 'Create a Resend API key; ROI adds SPF/DKIM/DMARC for mail.roictllc.com through the DNS API.',
    check: async (env) => {
      const r = await http('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
      return { ok: r.ok, detail: r.ok ? 'Resend reachable' : `HTTP ${r.status}` };
    },
  },
  {
    key: 'cloudflare', name: 'Cloudflare (DNS, Pages)', requiredEnv: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
    unlocks: ['Website publishing', 'Customer DNS & SSL', 'roictllc.com DNS'],
    ownerStep: 'Create an API token with DNS edit, Pages edit, Zone read; point roictllc.com nameservers to Cloudflare.',
    check: async (env) => {
      const r = await http('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
      return { ok: r.ok, detail: r.ok ? 'Token valid' : `HTTP ${r.status}` };
    },
  },
  {
    key: 'r2', name: 'Cloudflare R2 storage', requiredEnv: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_PRIVATE', 'R2_BUCKET_PUBLIC', 'R2_PUBLIC_BASE_URL', 'CLOUDFLARE_ACCOUNT_ID'],
    unlocks: ['Uploads', 'Deliverable files', 'Hosted email GIFs', 'Backups'],
    ownerStep: 'Create two R2 buckets (private, public) and an R2 API token.',
  },
  {
    key: 'turnstile', name: 'Cloudflare Turnstile', requiredEnv: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
    unlocks: ['Bot protection on signup, contact, previews'],
    ownerStep: 'Create a free Turnstile widget for roictllc.com.',
  },
  {
    key: 'registrar', name: 'Domain registrar', requiredEnv: ['REGISTRAR_PROVIDER', 'REGISTRAR_API_KEY', 'REGISTRAR_API_SECRET'],
    unlocks: ['Domain search, quotes and registration'],
    ownerStep: 'Open a Porkbun, Namecheap or Dynadot account with API access and fund it.',
  },
  {
    key: 'worker', name: 'Media worker server (VPS)', requiredEnv: ['SERVER_SSH_HOST', 'SERVER_SSH_USER', 'SERVER_SSH_KEY'],
    unlocks: ['GIF/video rendering', 'Logo revival', 'Site builds', 'Scheduled posting', 'Backups'],
    ownerStep: 'Rent a Linux VPS (≥ 2 vCPU / 4 GB, ~$10–25/month) and add its SSH details.',
  },
  {
    key: 'google', name: 'Google (Search Console / Business Profile)', requiredEnv: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
    unlocks: ['Measured keyword data', 'Business Profile checks'],
    ownerStep: 'Create an OAuth client in Google Cloud and verify the consent screen.',
  },
  {
    key: 'uspto', name: 'USPTO trademark data', requiredEnv: ['USPTO_API_KEY'],
    unlocks: ['Automated trademark name lookup in Logo Generator'],
    ownerStep: 'Optional: request a USPTO API key.',
  },
  {
    key: 'local_llm', name: 'Local language model (optional)', requiredEnv: ['LOCAL_LLM_BASE_URL'],
    unlocks: ['More fluent assistant and caption paraphrasing'],
    ownerStep: 'Optional: run Ollama or llama.cpp on ROI’s own server.',
  },
  {
    key: 'sentry', name: 'Error tracking', requiredEnv: ['SENTRY_DSN'], unlocks: ['Error alerts'],
    ownerStep: 'Optional: create a Sentry (or self-hosted GlitchTip) project.',
  },
];

export function missingEnv(def: IntegrationDef, env: NodeJS.ProcessEnv = process.env): string[] {
  return def.requiredEnv.filter((k) => !env[k] || !String(env[k]).trim());
}

export async function checkIntegration(def: IntegrationDef, env: NodeJS.ProcessEnv = process.env) {
  const missing = missingEnv(def, env);
  if (missing.length) return { status: 'AWAITING_CONFIGURATION' as const, missing, detail: `Missing: ${missing.join(', ')}` };
  if (!def.check) return { status: 'CONNECTED' as const, missing, detail: 'Variables present' };
  try {
    const r = await def.check(env);
    return { status: r.ok ? ('CONNECTED' as const) : ('ERROR' as const), missing, detail: r.detail };
  } catch (e) {
    return { status: 'ERROR' as const, missing, detail: (e as Error).name === 'AbortError' ? 'Timed out' : 'Check failed' };
  }
}

/** Social platforms belong to Social Media Autopilot, moved to phase 2 by the owner (DECISIONS D-21). Not checked or shown. */
export const PHASE_2_INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'meta', name: 'Meta (Facebook & Instagram)', requiredEnv: ['META_APP_ID', 'META_APP_SECRET'],
    unlocks: ['Facebook Pages & Instagram posting and insights'],
    ownerStep: 'Create a Meta developer app; complete Business Verification and App Review for publishing permissions.',
  },
  {
    key: 'tiktok', name: 'TikTok', requiredEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    unlocks: ['TikTok posting (after TikTok’s Content Posting API audit)'],
    ownerStep: 'Create a TikTok developer app and request the Content Posting API audit.',
  },
  {
    key: 'x', name: 'X (Twitter)', requiredEnv: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    unlocks: ['X posting (pay-per-use API credits)'],
    ownerStep: 'Create an X developer app and buy API credits.',
  },
];
export const PHASE_2_INTEGRATION_KEYS = PHASE_2_INTEGRATIONS.map((d) => d.key);
