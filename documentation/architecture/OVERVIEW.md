# Architecture overview

```
browser ──HTTPS──▶ apps/web (Next.js 16, App Router)
                     │  proxy.ts: CSP nonce, CSRF cookie, private-path guard, noindex for previews
                     │  server/*: auth, sessions, authz, rate limits, audit, pricing, commerce, finance
                     │  server actions + /api routes
                     ▼
               PostgreSQL (Neon / self-hosted 16+)
                     ▲  jobs table (FOR UPDATE SKIP LOCKED), LISTEN/NOTIFY
                     │
               apps/worker (Node, always-on)  ──▶ product engines (packages/*)
                     │                              ──▶ R2 / local storage (deliverables)
                     └──▶ outbound only via SSRF-safe fetch (packages/seo-engine/safe-fetch)
```

## Workspaces

| Package | Role |
|---|---|
| `apps/web` | Public site, auth, customer dashboard, staff admin, checkout, APIs, webhooks |
| `apps/worker` | Job runner: claim → heartbeat → handler → complete/fail with backoff; sweeper for stuck leases |
| `packages/database` | Prisma schema (137 models), migrations, tenant-scoping extension, seed |
| `packages/shared-utils` | Money, margin guard, domain pricing rule, AES-GCM, TOTP, Argon2id, claims lint |
| `packages/shared-types` | Roles and the permission matrix |
| `packages/validation` | zod schemas for every form and product brief |
| `packages/product-engine` | Catalog, queue, storage, handlers, signature suite, e-book tools, legal texts |
| `packages/video-engine` | Animated GIF logo (canvas + FFmpeg), logo revival |
| `packages/logo-engine` | Procedural logo generator, fingerprints and uniqueness screen, packages |
| `packages/site-generator` | 22 industry packs, unique-site generator with similarity gate |
| `packages/seo-engine` | Safe fetch, robots, AI-visibility audit |
| `packages/social-engine` | OAuth providers, engagement model, Thompson sampling, caption grammar |
| `packages/assistant` | Built-in assistant: Postgres full-text retrieval + scoped tools (no external AI API) |
| `packages/integrations` | Integration registry and live checks, R2 SigV4 |
| `packages/email-templates` | 21 transactional/marketing templates |

## Key rules enforced in code
- **Tenancy**: every tenant model is reached via `scoped(workspaceId)`; cross-tenant reads return null and writes throw `TENANT_VIOLATION` (integration-tested).
- **Money**: integer cents; Stripe fee model; a price change that drops margin below the floor needs a written override reason.
- **Domains**: effective price = max(first-year, renewal); under $15 ROI pays, $15 or more the customer pays in full.
- **Audit**: every privileged action is written to `audit_logs`, which the database refuses to modify.
- **Honesty**: products whose integrations are missing show `AWAITING_CONFIGURATION` / `COMING_SOON` instead of pretending to work.

See `documentation/DECISIONS.md` for the reasoning behind each choice.
