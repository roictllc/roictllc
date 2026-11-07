# HANDOFF (spec §0.2-5)

Session 1 ended with the platform ready for a private preview on Vercel + Neon (owner imports the repo; see FINAL_REPORT) and the items below remaining. Resume here.

## Done
See `IMPLEMENTATION_CHECKLIST.md` (✅ items) and `documentation/FINAL_REPORT.md` (test evidence).

## Next, in spec build order
1. ~~P1–P3 customer flows~~ ✅ done (upload → preview → pay → deliver). Remaining here: ~~P4~~ ✅, ~~P5 publishing/versions/rollback/editor~~ ✅ (still to do: OG images, editor image uploads). P8 signature-suite order flow ✅ done.
2. ~~Pre-payment preview flows~~ ✅ done for P1–P3 (verified email, Turnstile, daily limits, signed no-store preview URLs).
3. **Registrar adapters** (Porkbun, Namecheap, Dynadot) behind `RegistrarProvider` + domain search UI using `decideDomainPrice`.
4. **P6 crawler** (multi-page, Lighthouse via Chromium, findings, auto-fix on ROI sites, monthly PDF) and **P7** (Census Gazetteer importer `seed/import-us-places.ts`, location pages through the shingle gate, NAP checks).
5. ~~P9 jobs~~ — Social Media Autopilot moved to phase 2 (D-21); restore from branch `phase2-social-baseline` when the owner restarts it.
6. **P10**: per-client knowledge upload + embeddable widget; Part B encrypted client keys with PII redaction and spending limits.
7. **P11**: staff manual-check entry, monthly report PDF.
8. Staff UIs: ticket threads/replies, e-book upload, manager assignment, payout approvals, campaign editor + Resend webhooks + unsubscribe center, read-only customer preview.
9. Ops: ~~uptime/SSL checker jobs~~ ✅, Sentry, Lighthouse CI budgets, Playwright E2E suite, generated OG images, IndexNow, theme toggle, command palette.

## Blockers (owner)
See `documentation/OWNER_CHECKLIST.md`. Highest leverage: VPS (worker), Stripe sandbox + restricted live key, Cloudflare + R2, Resend.

## Environment notes
- Prisma native engines cannot be downloaded in the build sandbox → baseline SQL generated from DMMF (D-12); CI verifies no drift.
- `npm run db:apply` = migrate-deploy-equivalent without native engines.
