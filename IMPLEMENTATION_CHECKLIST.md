# IMPLEMENTATION CHECKLIST (spec v4)

Legend: ✅ built + automated test passes · 🟡 built, live use waits for an owner integration (`AWAITING_CONFIGURATION`, feature hidden/coming soon) · 🟠 partially built (see note) · ⬜ not built yet (see HANDOFF.md)

## Foundation (§4, §5, §23)
- ✅ Monorepo (apps/web, apps/worker, 14 packages, infrastructure, documentation)
- ✅ PostgreSQL schema: 137 models, snake_case tables, integer cents, timestamptz, FK indexes, soft delete — baseline migration + platform guards (D-12)
- ✅ Additive-only migration applier with Prisma bookkeeping; destructive SQL refused
- ✅ `npm run db:check` (OK/FAILED, no credentials printed) · ✅ `/api/health` (DB, queue, worker heartbeat, integrations)
- ✅ Idempotent seed (catalog, 11 products, 19 plans, roles/permissions, integrations, flags, settings, templates, legal docs, states, assistant KB); never overwrites admin edits; no fake customers
- ✅ Tenant isolation extension + cross-tenant tests · ✅ append-only audit log (DB trigger) + test
- 🟡 Neon production database — applied by the Vercel build (`prisma migrate deploy`), see FINAL_REPORT

## Auth & security (§6)
- ✅ Registration, login, logout, email verification, password reset, change password, suspension
- ✅ Argon2id; breached/common password checks (local list); min 12 chars
- ✅ Server-side sessions, `__Host-` cookie, idle/absolute timeouts, rotation on privilege change, reuse detection revokes family
- ✅ CSRF double-submit + strict Origin (+ Next server-action origin check)
- ✅ TOTP 2FA mandatory for ADMIN/PM/MANAGER, replay protection, hashed single-use recovery codes (tested)
- ✅ Lockout after repeated failures (tested) · ✅ PostgreSQL rate limits on login/reset/signup/contact/audit/assistant/checkout/tickets
- ✅ Strict CSP with per-request nonces, HSTS, frame-ancestors none, Referrer/Permissions/COOP/CORP
- ✅ SSRF-safe fetch (connect-time IP validation, redirects re-checked, size/time caps, robots) — 29 tests
- ✅ Upload validation (magic bytes, size, pixel cap, re-encode, EICAR) in engines · 🟡 ClamAV daemon in Docker Compose (needs VPS)
- ✅ AES-256-GCM for integration credentials/social tokens/2FA secrets (tested)
- ✅ Stripe webhook signature verification on raw body + idempotent event storage (tested)
- 🟠 Admin read-only customer preview (impersonation model + grant table exist; UI not built)
- ✅ Privacy export (JSON) + deletion request (ticket with legal timelines)
- 🟠 CI security: gitleaks, CodeQL, npm audit, Dependabot configured — first GitHub run pending

## Design system & public site (§7, §7.0, §7.1)
- ✅ v4 vivid tokens, gradient CTAs with glow, glass panels, aurora/grid/noise, reduced-motion, self-hosted fonts
- ✅ Homepage: AI Visibility hero (spec headline), labeled AI-answer illustration, 3-step strip, Social Autopilot band with 4 connect buttons; both first in the nav
- ✅ Pages: Home, About, Products, 11 product pages, Pricing, Websites, SEO & Local, Social media, AI Visibility (+ free audit + report), AI for business (+ quote form), E-books, 3 industry pages, Guides (3), Contact, FAQ, Login, Register, Privacy, Terms, Refund, Acceptable use, Takedown (+ DMCA form), Cookies, Status, 404/500
- ✅ Metadata (unique title/description, canonical, OG/Twitter), JSON-LD (Organization, WebSite, Product/Service + Offer from DB, FAQPage, BreadcrumbList, Article, HowTo), sitemap, robots with explicit AI-crawler rules, `llms.txt` generated from the DB
- 🟠 Light theme tokens exist; theme toggle UI not built · ⬜ generated OG images · ⬜ IndexNow pings · ⬜ Search Console/Bing verification (needs owner tokens) · ⬜ Lighthouse CI budgets · ⬜ command palette, drawers, toasts, sortable/exportable data tables

## Dashboards (§8)
- ✅ Control Center (ADMIN/PM/MANAGER with permission-filtered nav + service-layer checks): overview (live KPIs), finance (ledger-derived, reconciliation), products & pricing (versioned prices, live margin guard, cost model, copy, visibility gated by integrations), orders, customers, subscriptions, jobs monitor (retry/cancel), websites & domains, social, AI visibility, e-books (list), support (list), moderation & takedowns, email marketing (stats), affiliates, assistant knowledge, integrations (live checks), users & roles (create staff, suspend, role change, permission matrix toggles), feature flags, settings, audit log
- ✅ Customer workspace: overview, orders, downloads (signed URLs), website, SEO, social command center (connect, Full Autopilot consent, pause/kill, exact publish times, metrics with source + age, live refresh), AI Visibility (score, tracked questions, mention rate), assistant, billing (portal), support (open tickets), business identity, devices, export/delete
- ✅ Affiliate dashboard (link, code, commissions, payouts)
- 🟠 Ticket threads/replies UI, e-book upload form, campaign editor, payout approval UI, manager assignment UI — models + lists exist, editors not built

## Commerce & finance (§9, §14, §18)
- ✅ Server-side totals; checkout session creation (Stripe REST, tax, consent, idempotency keys) — 🟡 disabled until Stripe is connected
- ✅ Webhooks: checkout completed, invoice paid/failed (dunning + grace), subscription updated/deleted, refunds (+ affiliate clawback), disputes; fees from balance transactions (tested with fixtures)
- ✅ Price versioning + Stripe Price creation; margin guard blocks below minimum without a recorded reason (tested)
- ✅ Domain rule incl. $14.99/$15.00/$15.01 and renewal re-evaluation (tested) · ⬜ registrar adapters (Porkbun/Namecheap/Dynadot) + domain search UI
- ✅ Finance math from ledger (gross/net, MRR/ARR, revenue by product) with reconciliation test

## Engine & products (§10–§13)
- ✅ PostgreSQL queue: SKIP LOCKED claims, leases, heartbeats, backoff, dead-letter, sweeper, per-type concurrency (tested)
- ✅ Worker process with heartbeat, graceful shutdown, steps/logs/costs; StorageProvider (R2 SigV4 / local dev)
- ✅ P8 Email Signature Suite: 10 templates, email-HTML linter, CSV import, gallery, ZIP, install guides — engine + worker end-to-end test
- ✅ P1 Animated GIF Logo: validation, prep, 10 styles, watermarked previews, 1920×1080 GIF, ≤1 MB email GIF, PNG fallback, 10.0 s H.264 MP4, ffprobe QC, watermark absence check — engine tests; worker handler written
- ✅ P2 Logo Revival engine (classify, 4×, sharpness metric, SSIM-gated traced SVG) — 🟠 ONNX model optional (Lanczos fallback per spec), worker handler + preview video not wired
- ✅ P3 Logo Generator engine (7 archetypes, motifs, OFL fonts outlined, fingerprints, 500-mark uniqueness test, forensic-watermarked previews, 3 packages incl. PDFs) — 🟠 customer flow/handler not wired
- ✅ P4 E-book pipeline (validation, active-content rejection, Chapter-1 detection, 3 watermarked image pages, buyer-stamped copy) — 🟠 upload UI + handler not wired
- ✅ P5 Site generator (22 industry packs, quality gate, ≤5 s, uniqueness across 100 sites) — 🟠 publish pipeline (Cloudflare Pages) + editor/rollback not built; contact-form endpoint ✅
- 🟠 P6 Managed SEO: SSRF-safe fetch + AI-readiness checks exist; multi-page crawler, Lighthouse, reports not built
- 🟠 P7 GEO: shingle gate exists; Census importer, location pages, NAP checks not built
- ✅ P9 Social engine: OAuth (Meta/TikTok/X with PKCE), engagement rate, ridge regression, Thompson sampling, captions with claim filters, 30-day planner (tested); connect/callback routes ✅ — 🟡 platforms hidden until approvals; ⬜ publisher + insights ingestion jobs
- 🟠 P10 Part A assistant engine ✅ (global KB); per-client KB upload + embeddable widget + Part B (client keys) not built
- ✅ P11 AI Visibility free audit LIVE (7 categories, prioritized fixes, shareable report, email when configured); customer tracked questions ✅; staff manual-check entry UI + monthly report ⬜
- ✅ Built-in assistant: retrieval (Postgres FTS), intents, permission-scoped read-only tools as the asking user, citations, logging, refusal

## Operations (§15–§22)
- ✅ Email via Resend with logging; without a key → logged AWAITING_CONFIGURATION (tested); 21 templates; marketing requires postal address + unsubscribe
- ⬜ Campaign sending, automations, Resend webhooks, unsubscribe center
- ✅ Legal pages from DB (attorney-review note), DMCA form, contact form, moderation lists
- ✅ Status page, health endpoint, worker heartbeat · 🟠 Sentry not wired · ⬜ uptime/SSL checker jobs
- 🟠 Backups: encrypted pg_dump + monthly restore drill workflows written; need R2 + secrets to run
- 🟠 CI (`ci.yml`, deploy, backup, restore drill) written — first run on GitHub pending
- 🟠 Docker images + Compose + Caddy (on-demand TLS gate) written — not built here (no Docker daemon)
- ⬜ Playwright E2E suite (an end-to-end browser run of the admin sign-in/2FA flow was executed manually)
