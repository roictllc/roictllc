# Product 3 — Unique Logo Generator

> ROI’s Unique Logo Generator creates three original vector logo concepts from your company name, industry, colors and style. Each concept is similarity-screened against every logo ROI has generated or sold. Choose one and a package — Basic $24, Professional $37 or Premium $51 — and receive clean, unwatermarked files by email and in your dashboard.

**Kind:** ONE_TIME · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10000000
**Required integrations (LIVE gate):** stripe, r2, resend

## Plans (seed prices — admin-editable, versioned)
- **Basic** — $24.00 one-time: 3000 px PNG (transparent + white); JPG
- **Professional** — $37.00 one-time: Everything in Basic; SVG vector; One-color, black & white variants; Favicon & social avatar sets
- **Premium** — $51.00 one-time: Everything in Professional; Brand-kit PDF; Social banners; Business-card PDF; 2 revision rounds; Extended similarity report

## Workflow steps
1. form
2. generate
3. fingerprint
4. screen
5. preview
6. choose
7. package
8. deliver

## Honesty
Concepts are similarity-screened, not trademark-cleared. Check the USPTO database or an attorney before registering a mark.

## FAQ
- **Is my logo guaranteed to be unique?** No logo tool can promise that. Every concept is similarity-screened against all ROI logos and a reference set, purchased marks are reserved forever, and the report shows exactly what was checked.
- **Can I download the previews?** Previews are low-resolution with a watermark baked into the pixels. Clean files are delivered only after purchase.

## Customer flow (built)
1. **Start**: product page → "Create 3 free concepts" → `/dashboard/create/logo-generator` (sign-in required; free previews need a **verified email**; Turnstile when configured).
2. **Brief**: company name, tagline, industry, 1–3 colors, style, words to avoid (same zod schema as the server).**
3. **Preview job** `preview.logo-generator` (lane `preview`, priority 50, max 2 attempts) on the worker. Load the fingerprint pool (every ROI concept and sold mark + 36 reference motifs seeded from the engine) → `generateConcepts` (3 distinct archetypes, bounded attempts, escalates on failure) → for each concept: row + fingerprint + SimilarityReport (pool size, min distance, thresholds, name check against ROI customers + USPTO link) + ≤ 640 px preview with baked watermark and an LSB forensic tag (concept id).
4. **Preview display**: served only through `/api/previews/<id>?e=…&s=…` (HMAC-signed, ~10 min, session must own the workspace, `Cache-Control: no-store`, inline). Context menu, drag, copy and printing are blocked as deterrents; the baked-in watermark is the real protection.
5. **Buy**: consent checkbox → `buyPreviewAction` → Stripe Checkout. The paid job's inputs are copied from the stored preview on the server, never from the browser.
6. **Paid job** `product.logo-generator` (lane `paid`, priority 10, 3 attempts with backoff). Build the package for the chosen plan (Basic / Professional / Premium) → QC of the file list and the 3000 px master → ZIP + SVG → concept marked purchased, fingerprint **reserved forever** (`source = sold`); Premium marks the report extended.
7. **Delivery**: files listed under Products & downloads (`/api/files/<id>`: ownership + payment + item COMPLETED). Email `deliverable-ready` and an in-app notification.
8. **Failure**: after the last retry the item becomes FAILED; the customer gets `failure-notice`, ADMIN/MANAGER get `admin-alert`, and `housekeeping.auto-refund` is scheduled for +24 h. It refunds in full through Stripe unless staff retried or approved the item first. Without Stripe credentials it refuses and alerts the admin instead of pretending.

**Limits:** 5 free previews per verified account per day (setting `previews.dailyLimit`), 40 per IP per day, uploads 30/h per account. Previews of identical inputs are reused (input hash).
**Admin:** Jobs monitor → Retry / Cancel / **Approve & deliver** (for quality-gate holds). Flag `previews` opens previews before the product is LIVE (owner testing).
**Tests:** `tests/integration/logo-flows.test.ts` (real files, see test names).

## Build status
Engine ✅ · intake ✅ · preview job ✅ · paid job ✅ · customer pages ✅ · failure/refund rules ✅ · tests ✅ (real files). Live use needs: worker VPS (FFmpeg), R2, Stripe, Resend.
