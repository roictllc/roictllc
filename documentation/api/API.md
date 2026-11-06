# HTTP API

Every route below is served by `apps/web`. Mutating requests from the browser require the CSRF header (`X-CSRF-Token`) plus a same-origin `Origin`; webhooks instead verify a provider signature. Server actions (forms) are listed in `apps/web/src/server/actions/`.

| Path | Methods | Purpose |
|---|---|---|
| `/api/account/export` | GET | CCPA/CPRA data export (spec §6 Privacy): everything tied to the caller's workspace, secrets excluded. |
| `/api/assistant` | POST | Built-in ROI assistant: answers from the knowledge base plus permission-scoped lookups (orders, subscriptions, downloads, domains) for the signed-in workspace only. Rate limited. |
| `/api/billing/portal` | POST | Opens the Stripe customer portal for the signed-in workspace (returns AWAITING_CONFIGURATION until Stripe keys are set). |
| `/api/events` | GET | Server-Sent Events from Postgres LISTEN/NOTIFY (spec §2.1). Only events belonging to the caller's workspace are forwarded. On serverless hosts (no long-lived connections) it tells the client to fall back to polling. |
| `/api/files/[id]` | GET | Paid downloads (spec §6, §10): ownership check → short-lived signed URL. Previews never come through here. |
| `/api/health` | GET | GET /api/health — DB, queue depth, worker heartbeat, integrations (spec §5.2). 503 when core is down. |
| `/api/sites/[id]/contact` | POST | Contact form endpoint for ROI-generated customer websites (spec Product 5): Turnstile when configured, per-IP and per-site rate limits, honeypot + simple spam scoring, lead saved to the inbox and emailed to the owner. Cr |
| `/api/social/callback/[platform]` | GET | OAuth callback: verifies state + PKCE, exchanges the code, stores tokens encrypted (AES-256-GCM), records granted scopes. |
| `/api/social/connect/[platform]` | GET | Starts the official OAuth flow (spec Product 9). Hidden platforms redirect back with a notice. |
| `/api/webhooks/stripe` | POST | Stripe webhooks (spec §9.2): signature verified on the RAW body; events stored once; 2xx only after processing. |
| `/llms.txt` | GET | /llms.txt — concise, factual guide for AI systems (spec §7.1). Generated from the database so it never drifts. |
