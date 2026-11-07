# Product 8 — Email Signature Suite

> ROI’s Email Signature Suite creates matching, professional email signatures for up to 50 employees for a one-time $12. Add people manually or by CSV, choose one of ten tested templates, include your animated GIF logo, and download HTML, plain-text and a copy-to-clipboard gallery with install guides for Gmail, Outlook and Apple Mail.

**Kind:** ONE_TIME · **Delivery:** AUTOMATED · **Stripe tax code:** txcd_10000000
**Required integrations (LIVE gate):** stripe, r2, resend

## Plans (seed prices — admin-editable, versioned)
- **Email Signature Suite** — $12.00 one-time: Up to 50 employees; 10 tested templates; HTML + plain text + ZIP; Copy-to-clipboard gallery; Hosted images ≥ 24 months

## Workflow steps
1. company
2. employees
3. template
4. preview
5. pay
6. generate
7. zip
8. deliver

## Honesty
No guarantees of results; measured data is labeled with source and age.

## FAQ
- **Does it work in Outlook?** Yes. Templates use tables and inline CSS for Outlook’s Word-based renderer; animated GIFs show their first frame in some Outlook versions, so the first frame always shows your full logo.

## Customer flow (built)
1. Product page → "Build my signatures" → `/dashboard/create/email-signature-suite`.
2. Company block (name, website, address, brand colors, social links, banner/CTA, disclaimer), template (10), logo: the customer's paid **Animated GIF Logo** is detected and used automatically (checkbox), otherwise an optional static logo upload (same scanned intake as Product 1).
3. Employees: paste CSV or import a file; template at `/api/signatures/template.csv`; every row validated (name, email format, duplicates, phone format, https links), errors listed by line; limit `signatures.maxEmployees` (50).
4. **Preview** (no worker needed): the first 3 signatures rendered with a visible "ROI PREVIEW · NOT FOR USE" band; copy and context menu blocked. The validated data comes back as an HMAC-signed draft (workspace-bound, 24 h).
5. **Buy**: only a valid signed draft is accepted → Stripe Checkout → job `product.email-signature-suite`.
6. **Paid job**: static logo resized and published to the public bucket (permanent HTTPS URL for email clients) → all signatures rendered → email-HTML lint gate → ZIP (per-person HTML + text, gallery with copy buttons, install guides for Gmail, Outlook, Apple Mail, Thunderbird, Google Workspace admins) → delivery email.
7. Links are restricted to http(s); `javascript:`/`data:` links are dropped before rendering.

## Build status
Templates ✅ · linter ✅ · CSV ✅ · previews ✅ · signed drafts ✅ · paid job ✅ · tests ✅ (`tests/integration/signatures-flow.test.ts`). Live use needs: R2 (public bucket for logos), Stripe, Resend.
