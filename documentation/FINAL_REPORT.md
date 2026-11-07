# Final report: session 1 (spec v4)

Date: 2026-11-06 · Repository: `roictllc/roictllc` (branch `main`)

## Outcome
The ROI platform foundation, public site, customer dashboard, staff admin console, commerce core and the product engines are built and tested. The platform is ready to run as a **private preview** on Vercel + Neon. Checkout stays disabled and every product that needs an outside service shows `AWAITING_CONFIGURATION` / "coming soon" until the owner connects it. Nothing is faked.

## Verification evidence (real results, not estimates)

| Check | Result |
|---|---|
| Unit + integration tests (local, PostgreSQL 16) | **157 / 157 passed**, 12 files, 227 s |
| GitHub CI on `main` (run 42304682127) | **green**: test, npm audit, CodeQL, gitleaks |
| Real Prisma engine: `prisma migrate deploy` on an empty DB | both migrations applied |
| Seed run twice (idempotency) | 1st: created admin + catalog; 2nd: `SEED: OK {}` (no changes) |
| Drift check (`migrate diff` database ↔ `schema.prisma`) | **no drift** |
| `tsc --noEmit` (all workspaces + web) | 0 errors |
| `npm run db:check` | `DB_CHECK: OK (138 tables)` |
| Production build (`next build`) | success |
| Production-mode simulation (APP_ENV=production, no APP_URL, Vercel host vars, PREVIEW_NOINDEX=1) with the **real first-admin credentials** | sign-in → forced password change → TOTP enrollment → 10 recovery codes → admin console; 5 admin sections HTTP 200; 0 console errors |
| Customer browser flow | register → dashboard → built-in assistant answers with sources (a crash in newer Chrome, caused by `scrollIntoView` returning a Promise inside an effect, was found and fixed) |
| Security headers | per-request CSP nonce, HSTS, `X-Robots-Tag: noindex` on the preview |

What the automated tests cover: money and margin guard, the domain price rule ($14.99 / $15.00 / $15.01 and renewal), AES-GCM, TOTP and recovery codes, Argon2id, lockout, session rotation and reuse detection, tenant isolation (cross-tenant reads and writes refused), append-only audit log, the job queue (leases, retries, dead-letter, sweeper), Stripe webhook signatures, SSRF defences (29 cases), GIF logo rendering and QC, logo revival, logo uniqueness (500 marks, zero near-duplicates), site generator uniqueness, social engine (kept for phase 2), AI-visibility audit.

## Deployment status
- **Database**: Neon project `blue-forest-78059884` (PostgreSQL 18, us-east-1). Tables are created by the first Vercel build (`prisma migrate deploy`, verified above with the real engine).
- **Hosting**: Vercel team `team_n5Do0fVHYEllqMXY4JCqSy2W`. Project creation through the API was refused (403, no permission). The owner imports the repository in the Vercel dashboard (Root Directory `apps/web`) and pastes the prepared environment variables. See `deployment/DEPLOYMENT.md`.
- The app now detects its own Vercel URL (`VERCEL_PROJECT_PRODUCTION_URL`), so the preview works on whatever `*.vercel.app` name Vercel assigns. `APP_URL` is only needed once a custom domain is attached.

## First admin
- Email `roictllc@gmail.com`. The password was handed to the owner in the session, and only its Argon2id hash is stored in the deployment settings.
- At first sign-in the admin must set a new password and enroll an authenticator app (2FA). Recovery codes are shown once.

## Waiting on the owner (AWAITING_CONFIGURATION)
Connected: PostgreSQL. Not yet connected (each one unlocks the features listed in Admin → Integrations):
Stripe · Resend email · Cloudflare DNS/Pages · Cloudflare R2 · Turnstile · domain registrar · media worker VPS · Google (Search Console / Business Profile) · USPTO · local language model (optional) · Sentry.
Step-by-step: `documentation/OWNER_CHECKLIST.md`. Social Media Autopilot (and its Meta/TikTok/X approvals) moved to phase 2 at the owner's request (D-21).

## Not finished yet
The build order for the remaining work is in `documentation/HANDOFF.md`. In short:
- Worker handlers and pre-payment preview flows for products 2–4.
- Website publishing and the website editor.
- Registrar adapters.
- The SEO crawler and the location-page generator.
- Per-client assistant knowledge and the embeddable widget.
- Staff editors: tickets, campaigns and payouts.
- Sentry and uptime checks.
- The Playwright E2E suite.

Before taking real customers, the platform should move to a VPS (Docker Compose + Caddy), so that the worker, FFmpeg and live updates run all the time.

Line counts in `IMPLEMENTATION_CHECKLIST.md`: ✅ 48 · 🟡 5 · 🟠 15 · ⬜ 8.
