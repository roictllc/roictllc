#!/usr/bin/env bash
# Monthly restore drill (spec §19): newest backup → scratch database → integrity checks → pass/fail.
set -euo pipefail
: "${SCRATCH_DATABASE_URL:?missing}" "${BACKUP_PASSPHRASE:?missing}" "${R2_BUCKET_BACKUPS:?missing}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
EP="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
LATEST=$(aws s3 ls "s3://${R2_BUCKET_BACKUPS}/db/" --endpoint-url "$EP" | sort | tail -1 | awk '{print $4}')
[ -n "$LATEST" ] || { echo "RESTORE_DRILL: FAILED (no backups found)"; exit 1; }
aws s3 cp "s3://${R2_BUCKET_BACKUPS}/db/${LATEST}" /tmp/latest.enc --endpoint-url "$EP"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in /tmp/latest.enc -out /tmp/latest.dump -pass env:BACKUP_PASSPHRASE
pg_restore --no-owner --no-privileges -d "$SCRATCH_DATABASE_URL" /tmp/latest.dump
CHECK=$(psql "$SCRATCH_DATABASE_URL" -Atc "SELECT (SELECT count(*) FROM products) > 0 AND (SELECT count(*) FROM roles) = 5 AND (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) > 0")
[ "$CHECK" = "t" ] && echo "RESTORE_DRILL: PASS (${LATEST})" || { echo "RESTORE_DRILL: FAILED (integrity checks)"; exit 1; }
