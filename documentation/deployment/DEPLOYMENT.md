# Deployment

## Current: private preview on Vercel + Neon
- Project `roi-platform`, Root Directory `apps/web`, region `iad1`. `apps/web/vercel.json` runs `npm ci` and `npm run vercel-build` from the repo root.
- `vercel-build` = `prisma generate` → `prisma migrate deploy` → idempotent seed → `next build`. The seed creates the first admin only when no ADMIN exists (from `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD_HASH_B64`; the plain password is never stored in Vercel).
- `PREVIEW_NOINDEX=1` adds `X-Robots-Tag: noindex` and a disallow-all robots.txt.
- Checkout stays disabled until Stripe keys exist (`AWAITING_CONFIGURATION`).
- Limits of this mode: no always-on worker (jobs queue up but are not processed), SSE falls back to 60 s polling, no FFmpeg for GIF rendering.

### Environment variables (Production)
| Key | Notes |
|---|---|
| `APP_ENV` | `production` |
| `APP_URL` | the deployment URL, e.g. `https://roi-platform.vercel.app` |
| `PREVIEW_NOINDEX` | `1` while private |
| `DATABASE_URL` | Neon pooled URL (`-pooler` host) |
| `DATABASE_URL_UNPOOLED`, `DIRECT_URL` | Neon direct URL (migrations) |
| `SESSION_SECRET`, `CSRF_SECRET` | 32+ random bytes, base64 |
| `INTEGRATION_ENCRYPTION_KEY` | 32 random bytes, base64 (AES-256-GCM) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD_HASH_B64` | first admin only |
| `EMAIL_REPLY_TO` | support inbox |

Everything else (Stripe, Resend, R2, Cloudflare, Meta/TikTok/X, registrars, Turnstile) is optional; each unlocks the features listed in Admin → Integrations.

## Target: VPS (before taking real customers)
`infrastructure/docker/docker-compose.prod.yml` runs `web`, `worker`, PostgreSQL 16 and Caddy (automatic HTTPS). `infrastructure/scripts/deploy.sh` builds, applies migrations, seeds and restarts with a health check. Nightly encrypted backups (`backup.sh`, GitHub Action `nightly-backup.yml`) and a monthly restore drill (`restore-drill.yml`) are included. Steps: `documentation/operations/RUNBOOK.md`.
