# ROI — one platform for growth

ROI LLC's platform: public marketing site (SEO/GEO/AEO), customer workspaces, admin / PM / manager control center, 10 products (Social Media Autopilot is phase 2), payments, domains & hosting, social autopilot, built-in AI assistant (no external API), finance, support and email — built to the master spec v4.

## Monorepo
```
apps/web        Next.js 16 (App Router): public site, dashboards, API, webhooks
apps/worker     Node worker: PostgreSQL job queue, media pipelines (FFmpeg, canvas, sharp, resvg, poppler)
packages/       database (Prisma 7 + migrations + seed) · shared-utils · shared-types · validation · product-engine
                logo-engine · video-engine · site-generator · seo-engine · social-engine · assistant · integrations
                email-templates · design-tokens
infrastructure/ docker · caddy · scripts (backup, restore drill, deploy, link check)
documentation/  DECISIONS · OWNER_CHECKLIST · HANDOFF · FINAL_REPORT · products/ · operations/ · security/ · deployment/
```

## Quick start (local)
```bash
npm ci
cp .env.example apps/web/.env.local     # fill DATABASE_URL, SESSION_SECRET, INTEGRATION_ENCRYPTION_KEY
npm run db:generate
npm run db:apply                        # or: npm run db:migrate:deploy (needs Prisma engines)
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-long-local-password' npm run db:seed
npm run dev                             # http://localhost:3000
npm run worker                          # needs FFmpeg + poppler; LOCAL_STORAGE_DIR in dev
npm test                                # unit + integration (real Postgres: TEST_DATABASE_URL)
npm run db:check                        # DB_CHECK: OK (latency, version)
```

## Deploy
* **Private preview (now):** Vercel project `roi-platform` (root `apps/web`; build settings in `apps/web/vercel.json`). The build runs `prisma migrate deploy` and the idempotent seed before `next build`.
* **Production (spec §2.2):** one VPS with Docker Compose (`infrastructure/docker/docker-compose.prod.yml`: web, worker, ClamAV, Caddy) behind Cloudflare; deploy with `.github/workflows/deploy-production.yml` (manual approval, migrations first, smoke test, rollback).

See `documentation/OWNER_CHECKLIST.md` for the only steps that need the owner, and `documentation/FINAL_REPORT.md` for verified status.
