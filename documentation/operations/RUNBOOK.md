# Operations runbook

## Daily signals
- `/status` and `/api/health` (DB, queue depth/age, worker heartbeat, integrations). Alert if `/api/health` ≠ 200 or worker heartbeat > 2 min.
- `/admin/jobs`: failed/dead jobs → open, read `lastError`, fix, **Retry**. Automated-product failures not fixed within 24 h are refunded (Refund policy).
- `/admin/integrations`: press **Run live checks** after changing any credential.

## Incidents
1. **Site down**: check host status; `curl -fsS https://<host>/api/health`; roll back (Vercel: promote previous deployment; VPS: `infrastructure/scripts/deploy.sh` keeps the previous image tagged `roi-web:rollback`).
2. **Database unreachable**: Neon console → compute status; free plan autosuspends (cold start ~1 s). Restore from nightly backup if data is lost (Neon free keeps only ~6 h PITR).
3. **Payment webhook failures**: Stripe dashboard → Webhooks → resend; events are idempotent (stored in `webhook_events`).
4. **Suspected account takeover**: suspend the user in `/admin/users` (revokes all sessions); review `/admin/audit` (`auth.*`, `session.reuse_detected`).
5. **Abuse / takedown**: `/admin/moderation`; follow the DMCA workflow; repeat infringers are terminated.

## Secrets rotation
- `SESSION_SECRET`/`CSRF_SECRET`: rotate any time (sessions are random tokens hashed in the DB; users stay signed in).
- `INTEGRATION_ENCRYPTION_KEY`: rotate with a re-encryption job (decrypt with old, encrypt with new) for `integrations`, `social_accounts`, `two_factor_secrets`, `client_ai_connections`. Never change it without re-encrypting.
- Provider keys (Stripe, Resend, Cloudflare, R2, social apps): rotate at the provider, update env, run live checks.

## Backups
- Nightly encrypted `pg_dump` → private R2 bucket (`.github/workflows/nightly-backup.yml`); also run `infrastructure/scripts/backup.sh` before every migration.
- Monthly restore drill into a scratch database with integrity checks (`restore-drill.yml`) — must report PASS.

## Dependency cadence
Dependabot weekly; review security advisories immediately (`npm audit --omit=dev`). Log retention 30 days; logs avoid PII (emails only where operationally necessary).

## Monitoring jobs (worker)
The worker enqueues these every minute with time-bucketed idempotency keys (`monitor.uptime:<minute>` …), so running several workers never duplicates them:
| Job | Every | What it does |
|---|---|---|
| `monitor.uptime` | 1 min | GET each live customer site (SSRF-safe fetch) and `APP_URL/api/health`; DOWN alert to the owner + ADMIN/MANAGER after 2 consecutive failures, once per incident; recovery notice |
| `monitor.queue` | 5 min | alert when the oldest waiting customer job is older than 15 min or jobs dead-lettered in the last hour |
| `billing.enforce` | 1 h | suspend sites past their grace period / after a canceled subscription's period; restore on payment; prune monitoring job history after 7 days |
| `monitor.ssl-domains` | daily | certificate expiry for every verified domain of a live site + registered domain expiry; reminders at 30/14/7 days |
Alert state lives in `settings` under `alert-state:*` (hidden from the admin settings page).
