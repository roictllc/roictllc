# OWNER CHECKLIST — only what a machine cannot create (spec §24A)

Everything else is built and tested. Each line flips to **connected** in `/admin/integrations` when its live health check passes. Products that need a missing integration stay "Coming soon" automatically.

| # | What | Variables to set | Unlocks | Status |
|---|---|---|---|---|
| 1 | **VPS** (≥ 2 vCPU / 4 GB, ~$10–25/month) with SSH | `SERVER_SSH_HOST`, `SERVER_SSH_USER`, `SERVER_SSH_KEY` | Media worker (GIF/video, logo revival, site builds, scheduled posting), production hosting, backups | Awaiting owner |
| 2 | **Stripe**: a **sandbox** key for testing (none exists yet — the account is live-only) and a **restricted live key** for launch; webhook endpoint `https://<host>/api/webhooks/stripe` | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Checkout, subscriptions, refunds, portal | Awaiting owner |
| 3 | **Cloudflare**: account ID + API token (DNS edit, Pages edit, Zone read), two **R2** buckets (private, public) + R2 keys; point **roictllc.com** nameservers to Cloudflare (export existing DNS first) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `R2_*` | Uploads/deliverables, hosted email GIFs, customer DNS/SSL, website publishing | Awaiting owner |
| 4 | **Resend**: API key + webhook secret; ROI adds SPF/DKIM/DMARC for `mail.roictllc.com` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | All email (today messages are logged as "awaiting configuration") | Awaiting owner |
| 5 | **Registrar** with API (Porkbun, Namecheap or Dynadot), funded | `REGISTRAR_PROVIDER`, `REGISTRAR_API_KEY`, `REGISTRAR_API_SECRET` | Domain search/registration (domain rule already enforced in code) | Awaiting owner |
| 6 | **Turnstile** (free) | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot protection on forms (rate limits already active) | Awaiting owner |
| 7 | **Neon**: done — project `blue-forest-78059884` is connected; optional `NEON_API_KEY` for branch automation | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Everything | **Connected** |
| 8 | Later: **Meta** app (Business Verification + App Review), **TikTok** app (Content Posting API audit), **X** app + API credits, **Google** OAuth client, optional USPTO key | `META_*`, `TIKTOK_*`, `X_*`, `GOOGLE_OAUTH_*`, `USPTO_API_KEY` | Social Autopilot posting & live metrics; measured Search Console data | Awaiting owner (approvals take weeks) |
| 9 | Business: register a **DMCA agent** (U.S. Copyright Office, small fee); **attorney review** of legal pages; set the **postal address** in `/admin/settings → company` (required in marketing email) | — | Legal compliance | Awaiting owner |
| 10 | Hosting plan: Vercel **Pro** (commercial use) *or* the VPS above before taking real customers | — | Lawful commercial hosting | Awaiting owner |
