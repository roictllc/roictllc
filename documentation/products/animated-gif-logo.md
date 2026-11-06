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

## Build status
Engine ✅ (packages/video-engine, 14 tests incl. full-size ffprobe QC). Worker handler `product.animated-gif-logo` written. Needs: worker VPS, R2, Stripe.
