import 'server-only';
import { z } from 'zod';

/**
 * Boot-time environment validation (spec §3). Errors print variable NAMES only.
 * Integrations with missing variables are not errors: they report AWAITING_CONFIGURATION.
 */
const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(10),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(16).optional(),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(40),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  const e = parsed.data;
  // Stripe mode guard (spec §9.2): never test with live keys, never run production with test keys.
  const key = e.STRIPE_SECRET_KEY ?? '';
  const live = /^(sk|rk)_live_/.test(key);
  const test = /^(sk|rk)_test_/.test(key);
  if (key && (e.APP_ENV === 'development' || e.APP_ENV === 'staging' || e.APP_ENV === 'test') && live) {
    throw new Error('Refusing to start: STRIPE_SECRET_KEY is a LIVE key but APP_ENV is not production');
  }
  if (key && e.APP_ENV === 'production' && test && process.env.ROI_ALLOW_TEST_STRIPE_IN_PREVIEW !== '1') {
    throw new Error('Refusing to start: STRIPE_SECRET_KEY is a TEST key but APP_ENV is production');
  }
  cached = e;
  return e;
}

/**
 * Public base URL. APP_URL wins; on Vercel without APP_URL the project's production domain is used, so a
 * preview works on whatever *.vercel.app name Vercel assigned.
 */
export const appUrl = () => {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/$/, '');
  return 'http://localhost:3000';
};
export const isHttps = () => appUrl().startsWith('https://');
/** Hosts allowed as Origin for state-changing requests: the app host, Vercel's own hosts for this deployment, ALLOWED_ORIGINS. */
export const allowedOriginHosts = () =>
  new Set(
    [
      new URL(appUrl()).host,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      ...(process.env.ALLOWED_ORIGINS ?? '').split(','),
    ]
      .map((h) => (h ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))
      .filter(Boolean),
  );
