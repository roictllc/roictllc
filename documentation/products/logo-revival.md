# Product 2 — Logo Revival

> Logo Revival restores low-resolution logos. ROI denoises, upscales four times, refines edges and cleans colors, then shows a free watermarked 10-second preview video. For $9 you download a clean enhanced PNG, a transparent PNG, a 1080p reveal video and, when quality checks pass for flat logos, a traced SVG vector.

**Kind:** ONE_TIME · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10000000
**Required integrations (LIVE gate):** stripe, r2, resend, worker

## Plans (seed prices — admin-editable, versioned)
- **Logo Revival** — $9.00 one-time: 4× enhanced PNG; Transparent PNG; 1080p reveal MP4; Traced SVG when quality allows

## Workflow steps
1. validate
2. classify
3. enhance
4. trace
5. quality
6. video
7. deliver

## Honesty
Results are an enhanced reconstruction and may differ from a lost original file.

## FAQ
- **How small can my logo be?** Down to 64 px on the shortest side, though larger sources give better results.
- **Do I always get a vector?** Only for flat-color logos whose traced version matches the enhanced image closely. We never ship a vector that does not pass the check.

## Customer flow (built)
1. **Start**: product page → "Start free preview" → `/dashboard/create/logo-revival` (sign-in required; free previews need a **verified email**; Turnstile when configured).
2. **Upload** (minimum 64 px) as in Product 1, then output (transparent/white), logo type and optional text notes.**
3. **Preview job** `preview.logo-revival` (lane `preview`, priority 50, max 2 attempts) on the worker. Enhance (classify, 4×, sharpness metric, SSIM-gated vector) → 10 s 960×540 reveal video with the tiled watermark + poster → watermark QC. Metrics are stored and shown to the customer.
4. **Preview display**: served only through `/api/previews/<id>?e=…&s=…` (HMAC-signed, ~10 min, session must own the workspace, `Cache-Control: no-store`, inline). Context menu, drag, copy and printing are blocked as deterrents; the baked-in watermark is the real protection.
5. **Buy**: consent checkbox → `buyPreviewAction` → Stripe Checkout. The paid job's inputs are copied from the stored preview on the server, never from the browser.
6. **Paid job** `product.logo-revival` (lane `paid`, priority 10, 3 attempts with backoff). Enhance → 10 s 1920×1080 clean video → no-watermark QC → enhanced PNG, transparent PNG, MP4, traced SVG (only if SSIM passes, labeled "traced vector"), original. If the quality gate is below target the item waits for a manager (WAITING_FOR_APPROVAL); files are not downloadable until approved.
7. **Delivery**: files listed under Products & downloads (`/api/files/<id>`: ownership + payment + item COMPLETED). Email `deliverable-ready` and an in-app notification.
8. **Failure**: after the last retry the item becomes FAILED; the customer gets `failure-notice`, ADMIN/MANAGER get `admin-alert`, and `housekeeping.auto-refund` is scheduled for +24 h. It refunds in full through Stripe unless staff retried or approved the item first. Without Stripe credentials it refuses and alerts the admin instead of pretending.

**Limits:** 3 (spec) free previews per verified account per day (setting `previews.dailyLimit`), 40 per IP per day, uploads 30/h per account. Previews of identical inputs are reused (input hash).
**Admin:** Jobs monitor → Retry / Cancel / **Approve & deliver** (for quality-gate holds). Flag `previews` opens previews before the product is LIVE (owner testing).
**Tests:** `tests/integration/logo-flows.test.ts` (real files, see test names).

## Build status
Engine ✅ · intake ✅ · preview job ✅ · paid job ✅ · customer pages ✅ · failure/refund rules ✅ · tests ✅ (real files). Live use needs: worker VPS (FFmpeg), R2, Stripe, Resend.
