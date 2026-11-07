# Final report (spec v4) — updated 2026-11-07

Date: 2026-11-06 · Repository: `roictllc/roictllc` (branch `main`)

## Session 2 additions (2026-11-07)
- **Owner decision:** Social Media Autopilot moved to phase 2 (D-21); removed from the product, kept dormant in code, full UI on branch `phase2-social-baseline`.
- **Customer flows that now work end to end** (upload/brief → free watermarked preview → pay → files, emails, failure → 24 h auto-refund): Animated GIF Logo, Logo Revival, Logo Generator, Email Signature Suite, E-Book Library (staff upload → processing → catalog → stamped copies), Website + Hosting (builder, versions, preview, publish/rollback, Cloudflare Pages or ROI host, own-domain verification, Porkbun domain registration under the $15 rule).
- **AI Visibility:** staff manual checks, per-engine dashboard with data age, monthly PDF reports.
- **Operations:** monitoring jobs (uptime, SSL/domain expiry, queue health), billing enforcement (grace → suspended → restored), CI that runs the real Prisma migrate/seed/drift check.
- **Bugs found and fixed:** assistant crash in new Chrome, React 19 form reset wiping user input, 404 page without CSP nonce, scalar-list columns without defaults (migration `20261107000000_list_defaults`), customer sites inheriting ROI security headers, two flaky/isolation test issues.

## Outcome
The ROI platform foundation, public site, customer dashboard, staff admin console, commerce core and the product engines are built and tested. The platform is ready to run as a **private preview** on Vercel + Neon. Checkout stays disabled and every product that needs an outside service shows `AWAITING_CONFIGURATION` / "coming soon" until the owner connects it. Nothing is faked.

## Verification evidence (real results, not estimates)

| Check | Result |
|---|---|
| Unit + integration tests (local, PostgreSQL 16) | **183 / 183 passed**, 19 files |
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
- **Managed SEO (P6):** multi-page crawler, Lighthouse, fix list, monthly PDF, auto-fixes on ROI sites.
- **GEO (P7):** US place database importer, location pages through the quality gate, NAP checks.
- **AI Business Integration (P10):** per-client knowledge upload + embeddable widget; client-key AI features (also enables API-based AI Visibility checks).
- **Domains:** Stripe checkout for domains of $15/year or more, renewal invoices and notices, Namecheap/Dynadot adapters.
- **Websites:** generated OG images, image uploads in the editor.
- **Staff editors:** support ticket threads, email campaigns + unsubscribe center, affiliate payout approvals, manager assignment, read-only customer preview.
- **Ops:** Sentry, Lighthouse CI budgets, Playwright E2E suite, IndexNow, theme toggle.

Before taking real customers, the platform should move to a VPS (Docker Compose + Caddy), so that the worker, FFmpeg, monitoring and the ROI website host run all the time.

Line counts in `IMPLEMENTATION_CHECKLIST.md`: ✅ 50 · 🟡 6 · 🟠 12 · ⬜ 7 · ⏸ 2 (phase 2).
