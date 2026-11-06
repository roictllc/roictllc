import 'server-only';
import { db } from './db';

/**
 * Fixed-window rate limiting stored in PostgreSQL (spec §6) — no Redis. Atomic upsert per key.
 * Returns { ok, remaining, retryAfterS }.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db().$queryRaw<Array<{ count: number; window_start: Date }>>`
    INSERT INTO rate_limit_buckets (key, count, "windowStart", "createdAt", "updatedAt")
    VALUES (${key}, 1, now(), now(), now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limit_buckets.count + 1 END,
      "windowStart" = CASE WHEN rate_limit_buckets."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limit_buckets."windowStart" END,
      "updatedAt" = now()
    RETURNING count, "windowStart" AS window_start`;
  const { count, window_start } = rows[0];
  const retryAfterS = Math.max(0, Math.ceil(windowSeconds - (Date.now() - new Date(window_start).getTime()) / 1000));
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterS };
}

export const LIMITS = {
  login: { perIp: [20, 900], perEmail: [8, 900] },
  signup: [5, 3600],
  reset: [5, 3600],
  contact: [5, 3600],
  audit: [6, 3600],
  assistant: [40, 600],
  checkout: [20, 3600],
  upload: [30, 3600],
} as const;
