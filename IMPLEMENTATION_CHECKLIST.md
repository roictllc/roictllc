# IMPLEMENTATION CHECKLIST (spec v4)

Legend: ⏸ moved to phase 2 by the owner · ✅ built + automated test passes · 🟡 built, live use waits for an owner integration (`AWAITING_CONFIGURATION`, feature hidden/coming soon) · 🟠 partially built (see note) · ⬜ not built yet (see HANDOFF.md)

## Foundation (§4, §5, §23)
- ✅ Monorepo (apps/web, apps/worker, 14 packages, infrastructure, documentation)
- ✅ Scalar lists default to empty arrays (migration `20261107000000_list_defaults`, found by the e-book tests)
- ✅ PostgreSQL schema: 137 models, snake_case tables, integer cents, timestamptz, FK indexes, soft delete — baseline migration + platform guards (D-12)
- ✅ Additive-only migration applier with Prisma bookkeeping; destructive SQL refused
- ✅ `npm run db:check` (OK/FAILED, no credentials printed) · ✅ `/api/health` (DB, queue, worker heartbeat, integrations)
- ✅ Idempotent seed (catalog, 10 launch products + 1 phase-2 product kept hidden, 16 plans, roles/permissions, integrations, flags, settings, templates, legal docs, states, assistant KB); never overwrites admin edits; no fake customers
- ✅ Tenant isolation extension + cross-tenant tests · ✅ append-only audit log (DB trigger) + test
- 🟡 Neon production database — created by the first Vercel build (`prisma migrate deploy`, verified with the real engine in CI), see FINAL_REPORT

## Auth & security (§6)
- ✅ Registration, login, logout, email verification, password reset, change password, suspension
- ✅ Argon2id; breached/common password checks (local list); min 12 chars
- ✅ Server-side sessions, `__Host-` cookie, idle/absolute timeouts, rotation on privilege change, reuse detection revokes family
- ✅ CSRF double-submit + strict Origin (+ Next server-action origin check)
- ✅ TOTP 2FA mandatory for ADMIN/PM/MANAGER, replay protection, hashed single-use recovery codes (tested)
- ✅ Lockout after repeated failures (tested) · ✅ PostgreSQL rate limits on login/reset/signup/contact/audit/assistant/checkout/tickets
- ✅ Strict CSP with per-request nonces, HSTS, frame-ancestors none, Referrer/Permissions/COOP/CORP
- ✅ SSRF-safe fetch (connect-time IP validation, redirects re-checked, size/time caps, robots) — 29 tests
- ✅ Upload pipeline: size cap before read, builtin scan (EICAR, scripts, ZIP polyglots), ClamAV INSTREAM client (fails closed) when `CLAMAV_HOST` is set, magic bytes, pixel cap, re-encode, EXIF stripped (tested) · 🟡 ClamAV daemon runs on the VPS
- ✅ AES-256-GCM for integration credentials/2FA secrets (tested)
- ✅ Stripe webhook signature verification on raw body + idempotent event storage (tested)
- 🟠 Admin read-only customer preview (impersonation model + grant table exist; UI not built)
- ✅ Privacy export (JSON) + deletion request (ticket with legal timelines)
- ✅ CI security: gitleaks, CodeQL, npm audit, Dependabot — all green on GitHub (run 42304682127); Dependabot already opened update PRs

## Design system & public site (§7, §7.0, §7.1)
- ✅ v4 vivid tokens, gradient CTAs with glow, glass panels, aurora/grid/noise, reduced-motion, self-hosted fonts
- ✅ Homepage: AI Visibility hero (spec headline), labeled AI-answer illustration, 3-step strip; AI Visibility first in the nav (Social Autopilot band removed: phase 2, D-21)
- ✅ Forms keep what the user typed after a server error (React 19 auto-reset avoided; works without JavaScript too); 404 page rendered per request so its scripts carry the CSP nonce
- ✅ Pages: Home, About, Products, 10 product pages, Pricing, Websites, SEO & Local, AI Visibility (+ free audit + report), AI for business (+ quote form), E-books, 3 industry pages, Guides (3), Contact, FAQ, Login, Register, Privacy, Terms, Refund, Acceptable use, Takedown (+ DMCA form), Cookies, Status, 404/500
- ✅ Metadata (unique title/description, canonical, OG/Twitter), JSON-LD (Organization, WebSite, Product/Service + Offer from DB, FAQPage, BreadcrumbList, Article, HowTo), sitemap, robots with explicit AI-crawler rules, `llms.txt` generated from the DB
- 🟠 Light theme tokens exist; theme toggle UI not built · ⬜ generated OG images · ⬜ IndexNow pings · ⬜ Search Console/Bing verification (needs owner tokens) · ⬜ Lighthouse CI budgets · ⬜ command palette, drawers, toasts, sortable/exportable data tables

## Dashboards (§8)
- ✅ Control Center (ADMIN/PM/MANAGER with permission-filtered nav + service-layer checks): overview (live KPIs), finance (ledger-derived, reconciliation), products & pricing (versioned prices, live margin guard, cost model, copy, visibility gated by integrations), orders, customers, subscriptions, jobs monitor (retry/cancel), websites & domains, AI visibility, e-books (list), support (list), moderation & takedowns, email marketing (stats), affiliates, assistant knowledge, integrations (live checks), users & roles (create staff, suspend, role change, permission matrix toggles), feature flags, settings, audit log
- ✅ Customer workspace: overview, orders, downloads (signed URLs), website, SEO, AI Visibility (score, tracked questions, mention rate), assistant, billing (portal), support (open tickets), business identity, devices, export/delete
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
- ✅ P8 Email Signature Suite: 10 table-based templates, email-HTML linter, CSV import with per-row errors + downloadable template, watermarked live previews (first 3 people), signed drafts (no client-trusted inputs), static logo published to the public bucket or the Animated GIF Logo reused, UTM links, unsafe links dropped, gallery with copy buttons, install guides, ZIP — tests incl. ZIP contents; browser-verified
- ✅ P1 Animated GIF Logo: upload intake (scan + re-encode), 10 styles, cached watermarked 480 px preview job, paid render (1920×1080 GIF, ≤1 MB email GIF, PNG fallback, 10.0 s MP4), ffprobe QC, watermark present in previews / absent in paid files, delivery email, 24 h auto-refund rule — integration tests on real files; customer pages verified in a browser · 🟡 live use needs VPS worker + R2 + Stripe
- ✅ P2 Logo Revival: engine (classify, 4×, sharpness metric, SSIM-gated traced SVG), 10 s 540p watermarked preview video, 1080p clean delivery, manager approval hold, 3 previews/day — tests on real files · 🟠 ONNX super-resolution model optional (Lanczos fallback per spec)
- ✅ P3 Logo Generator: 3 screened concepts per brief (pool = all ROI marks + 36 seeded reference motifs), similarity report + name check, ≤640 px forensic-tagged previews, Basic/Professional/Premium packages, sold marks reserved — tests on real files incl. ZIP contents
- ✅ P4 E-Book Library: staff upload straight to storage (presigned PUT, 200 MB), rights attestation, processing job (validation, active-content rejection, ClamAV when configured, page count, Chapter-1 detection, cover, exactly N watermarked preview images), editor (re-render, publish checks, margin-guarded per-book price synced to Stripe, buyers + download history), audited source access for staff only, public catalog with search + categories + Book schema, signed sample-page URLs, buyer-stamped copy (footer + metadata) with download limit — tests on real PDFs; browser-verified
- ✅ P5 Website + Hosting: builder (all spec fields, real-testimonial and service-area attestations), unique site in ~0.25 s, quality gate, immutable versions with full-site preview, edit → new version, publish / **rollback**, HostingProvider: Cloudflare Pages Direct Upload (BLAKE3 asset hashes, upload-token/check-missing/upload/upsert-hashes/deployments; limits recorded) with automatic fallback to the ROI multi-tenant host (serving by verified domain, strict site CSP, Caddy on-demand TLS gate `/api/sites/tls-allowed`), connect-your-own-domain with DNS TXT verification + automatic rebuild for canonical URLs, past-due grace → placeholder page, lead inbox — tests incl. mocked Cloudflare protocol; browser-verified · 🟡 Cloudflare live deploy untested until credentials exist (protocol is undocumented: verify on first deploy) · ⬜ OG image generation, image uploads in the editor, uptime/SSL monitors
- 🟠 P6 Managed SEO: SSRF-safe fetch + AI-readiness checks exist; multi-page crawler, Lighthouse, reports not built
- 🟠 P7 GEO: shingle gate exists; Census importer, location pages, NAP checks not built
- ⏸ P9 Social Media Autopilot: moved to phase 2 by the owner (DECISIONS D-21). Engine package kept and tested (OAuth/PKCE, engagement model, Thompson sampling, claim filters); UI preserved on branch `phase2-social-baseline`.
- 🟠 P10 Part A assistant engine ✅ (global KB); per-client KB upload + embeddable widget + Part B (client keys) not built
- ✅ P11 AI Visibility free audit LIVE (7 categories, prioritized fixes, shareable report, email when configured); customer tracked questions ✅; staff manual-check entry UI + monthly report ⬜
- ✅ Built-in assistant: retrieval (Postgres FTS), intents, permission-scoped read-only tools as the asking user, citations, logging, refusal

## Operations (§15–§22)
- ✅ Email via Resend with logging; without a key → logged AWAITING_CONFIGURATION (tested); 21 templates; marketing requires postal address + unsubscribe
- ⬜ Campaign sending, automations, Resend webhooks, unsubscribe center
- ✅ Legal pages from DB (attorney-review note), DMCA form, contact form, moderation lists
- ✅ Status page, health endpoint, worker heartbeat · 🟠 Sentry not wired · ⬜ uptime/SSL checker jobs
- 🟠 Backups: encrypted pg_dump + monthly restore drill workflows written; need R2 + secrets to run
- ✅ CI green on GitHub: real Prisma `migrate deploy` + seed twice + zero-drift check (same steps as the Vercel build), typecheck, 157 tests, production build, link check · 🟠 deploy/backup/restore-drill workflows need VPS + R2 secrets
- 🟠 Docker images + Compose + Caddy (on-demand TLS gate) written — not built here (no Docker daemon)
- ⬜ Playwright E2E suite (an end-to-end browser run of the admin sign-in/2FA flow was executed manually)
