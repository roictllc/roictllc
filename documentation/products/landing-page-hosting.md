# Product 5 — Instant Landing Page + Hosting

> ROI’s Instant Landing Page + Hosting builds a fast, mobile-friendly business website from your details and shows a live preview in about five seconds. For $32 a month ROI hosts it with SSL, uptime monitoring, a lead inbox and version history. Domains whose yearly price is under $15 are included; pricier domains are paid by you.

**Kind:** SUBSCRIPTION · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10103000
**Required integrations (LIVE gate):** stripe, cloudflare, registrar, resend

## Plans (seed prices — admin-editable, versioned)
- **Website + Hosting** — $32.00/month: Live preview in ~5 s; Hosting, SSL, uptime checks; Lead inbox; Version history & rollback; Domain included if under $15/yr

## Workflow steps
1. form
2. generate
3. preview
4. domain
5. pay
6. build
7. deploy
8. dns
9. ssl
10. live

## Honesty
No guarantees of results; measured data is labeled with source and age.

## FAQ
- **Is the domain free?** If the domain’s yearly price (the higher of first-year and renewal) is under $15.00, ROI pays for it while your subscription is active. At $15.00 or more you pay the full price at registration and each renewal.
- **What happens if a payment fails?** You have a 7-day grace period. After that the site shows a placeholder; your data is kept for 90 days and you can export it.

## How it works (built)
1. **Build** (`/dashboard/create/landing-page-hosting`): business name, industry pack, description, tagline, up to 6 services (name, description, price), phone, email, address, city, state, hours, service areas (with an attestation that the business serves them), brand colors, design family, CTA goal + booking link, social links, up to 3 testimonials (each must be ticked as genuine), licenses. Server validation with the shared zod schema.
2. **Generate**: `generateUniqueSite` (seeded wording variants; 5-word-shingle similarity against every other ROI site; up to 8 attempts, otherwise the version is held for review) → quality gate (tokens, required fields, one h1, titles, meta descriptions, alt text, labeled fields, internal links, claims) → bundle stored as an **immutable version** (`sites/<id>/v<N>-<hash>.json`). Typical time: ~0.25 s.
3. **Preview**: `/site-preview/<id>/<version>/` (owner and staff only, links rewritten, framed in the dashboard, never indexed).
4. **Subscribe** ($32/month) → Stripe → job `product.landing-page-hosting` → links the subscription and publishes.
5. **Publish / rollback**: any saved version can be published (job `website.publish`); publishing an older version is the rollback. Each publish is a `WebsiteDeployment` (LIVE/SUPERSEDED/FAILED).
6. **Hosting**: Cloudflare Pages (one project per site, Direct Upload API) while the account is below its project limit (100 per account, recorded 2026-11-06; fallback starts 5 before the limit), otherwise the **ROI host**: the ROI server serves the live bundle for the site's verified domain (`/site-host`), with its own strict CSP (`script-src 'none'`) and HSTS without subdomains; TLS through Caddy on-demand certificates, which only issue for verified domains of published sites.
7. **Domain**: connect a domain you own → TXT record `_roi-verify.<domain>` + CNAME to the host → Verify (DNS lookup) → the site is rebuilt so canonical URLs, Open Graph, sitemap and schema use the domain, and republished. **Buy a domain** (Porkbun): search in the dashboard → quote with the ROI rule (effective = higher of first-year and renewal; under $15 included while subscribed) → registrant contact (the customer is the legal owner) → job `domain.register`: price re-check (stops if the category changed), dry run, idempotent registration, registrant contacts, DNS (A/ALIAS + www CNAME to the host), ROI-paid expense recorded, renewal scheduled, site rebuilt with the domain and republished. Domains of $15/year or more: checkout coming next.
8. **Billing rules**: past due → grace period (setting `billing.graceDays`) → placeholder page; canceled → stays up until the paid period ends.

**Env:** `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_PAGES_TOKEN` (Pages: Edit) for Cloudflare; `ROI_SITE_HOST_TARGET` (the hostname/IP customers point their CNAME/A to) for the ROI host.
**Note:** the Direct Upload asset endpoints are the ones wrangler uses and are not formally documented; verify the first live deploy, and the fallback keeps sites online if they change.

## Build status
Builder ✅ · generator + quality gate ✅ · versions/preview ✅ · publish/rollback ✅ · ROI host + TLS gate ✅ · Cloudflare provider ✅ (mocked protocol test) · domain verification ✅ · billing placeholder ✅ · tests ✅ (`tests/integration/websites-flow.test.ts`). Pending: OG images, editor image uploads, monitors, registrar purchase.
