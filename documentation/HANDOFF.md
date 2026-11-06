# HANDOFF (spec §0.2-5)

Session 1 ended with the platform deployed as a private preview and the items below remaining. Resume here.

## Done
See `IMPLEMENTATION_CHECKLIST.md` (✅ items) and `documentation/FINAL_REPORT.md` (test evidence).

## Next, in spec build order
1. **Wire remaining product handlers into the worker** (engines already tested): P2 revival (+ watermarked 540p preview video), P3 concept generation flow (form → 3 concepts → choose package → deliver ZIP), P4 e-book upload form + preview/stamp jobs, P5 publish pipeline (Cloudflare Pages Direct Upload `HostingProvider`, versions, rollback, editor).
2. **Pre-payment preview flows** (P1–P3): upload endpoint → quarantine → scan → preview job; rate limits per verified account; preview pages.
3. **Registrar adapters** (Porkbun, Namecheap, Dynadot) behind `RegistrarProvider` + domain search UI using `decideDomainPrice`.
4. **P6 crawler** (multi-page, Lighthouse via Chromium, findings, auto-fix on ROI sites, monthly PDF) and **P7** (Census Gazetteer importer `seed/import-us-places.ts`, location pages through the shingle gate, NAP checks).
5. **P9 jobs**: publisher (per platform), metrics ingestion (Meta webhooks + polling), model retraining nightly, calendar generation from `planCalendar`.
6. **P10**: per-client knowledge upload + embeddable widget; Part B encrypted client keys with PII redaction and spending limits.
7. **P11**: staff manual-check entry, monthly report PDF.
8. Staff UIs: ticket threads/replies, e-book upload, manager assignment, payout approvals, campaign editor + Resend webhooks + unsubscribe center, read-only customer preview.
9. Ops: uptime/SSL checker jobs, Sentry, Lighthouse CI budgets, Playwright E2E suite, generated OG images, IndexNow, theme toggle, command palette.

## Blockers (owner)
See `documentation/OWNER_CHECKLIST.md`. Highest leverage: VPS (worker), Stripe sandbox + restricted live key, Cloudflare + R2, Resend.

## Environment notes
- Prisma native engines cannot be downloaded in the build sandbox → baseline SQL generated from DMMF (D-12); CI verifies no drift.
- `npm run db:apply` = migrate-deploy-equivalent without native engines.
