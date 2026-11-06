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
