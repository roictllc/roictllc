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

## Build status
Engine ✅ (packages/video-engine/src/revival.ts, 3 tests). Super-resolution uses Lanczos3 + unsharp fallback until an ONNX Real-ESRGAN-class model is installed at LOGO_SR_MODEL_PATH. Handler + preview video: next session.
