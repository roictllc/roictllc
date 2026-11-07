# Product 1 — Animated GIF Logo

> ROI’s Animated GIF Logo turns an uploaded PNG or JPG logo into a seamless looping animation. You preview it free with a watermark, then pay $21 to download a 1920×1080 master GIF, an email-optimized GIF under 1 MB, a transparent PNG fallback and a free 10-second 1080p MP4 reveal video.

**Kind:** ONE_TIME · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10000000
**Required integrations (LIVE gate):** stripe, r2, resend, worker

## Plans (seed prices — admin-editable, versioned)
- **Animated GIF Logo** — $21.00 one-time: 1920×1080 master GIF; Email GIF ≤ 1 MB; PNG fallback; Free 10 s 1080p reveal MP4

## Workflow steps
1. validate
2. prepare
3. preview
4. render
5. encode
6. qc
7. store
8. deliver

## Honesty
No guarantees of results; measured data is labeled with source and age.

## FAQ
- **Will the GIF work in Gmail signatures?** Yes. We host the email GIF on a permanent HTTPS URL and show you the exact steps: Settings → Signature → Insert image → Web address (URL). Some Outlook versions show only the first frame, so the first frame always shows your full logo.
- **What files do I need?** A PNG, JPG or JPEG up to 10 MB with the shortest side at least 300 px. Transparent PNGs give the best results.
- **What if rendering fails?** We retry automatically, then a manager steps in. If it still fails within 24 hours you are refunded in full automatically.

## Customer flow (built)
1. **Start**: product page → "Start free preview" → `/dashboard/create/animated-gif-logo` (sign-in required; free previews need a **verified email**; Turnstile when configured).
2. **Upload**: `/api/uploads/logo` → size cap, builtin scan (EICAR, scripts, ZIP polyglots) + ClamAV INSTREAM when `CLAMAV_HOST` is set (fails closed), magic bytes, pixel cap, re-encode to PNG (EXIF and payloads dropped), dedup by hash. Then pick style, background, loop speed, tagline and effect colors.**
3. **Preview job** `preview.animated-gif-logo` (lane `preview`, priority 50, max 2 attempts) on the worker. Prepare → render 480×270, 2 s, 12 fps with the tiled watermark baked in → QC fails the job if the watermark is not detected.
4. **Preview display**: served only through `/api/previews/<id>?e=…&s=…` (HMAC-signed, ~10 min, session must own the workspace, `Cache-Control: no-store`, inline). Context menu, drag, copy and printing are blocked as deterrents; the baked-in watermark is the real protection.
5. **Buy**: consent checkbox → `buyPreviewAction` → Stripe Checkout. The paid job's inputs are copied from the stored preview on the server, never from the browser.
6. **Paid job** `product.animated-gif-logo` (lane `paid`, priority 10, 3 attempts with backoff). Full render (master GIF, email GIF ≤ 1 MB, PNG fallback, 10 s 1080p MP4, original) → ffprobe QC → **no-watermark QC** against the clean source → store; email GIF and PNG on the public bucket for Gmail.
7. **Delivery**: files listed under Products & downloads (`/api/files/<id>`: ownership + payment + item COMPLETED). Email `deliverable-ready` and an in-app notification.
8. **Failure**: after the last retry the item becomes FAILED; the customer gets `failure-notice`, ADMIN/MANAGER get `admin-alert`, and `housekeeping.auto-refund` is scheduled for +24 h. It refunds in full through Stripe unless staff retried or approved the item first. Without Stripe credentials it refuses and alerts the admin instead of pretending.

**Limits:** 10 free previews per verified account per day (setting `previews.dailyLimit`), 40 per IP per day, uploads 30/h per account. Previews of identical inputs are reused (input hash).
**Admin:** Jobs monitor → Retry / Cancel / **Approve & deliver** (for quality-gate holds). Flag `previews` opens previews before the product is LIVE (owner testing).
**Tests:** `tests/integration/logo-flows.test.ts` (real files, see test names).

## Build status
Engine ✅ · intake ✅ · preview job ✅ · paid job ✅ · customer pages ✅ · failure/refund rules ✅ · tests ✅ (real files). Live use needs: worker VPS (FFmpeg), R2, Stripe, Resend.
