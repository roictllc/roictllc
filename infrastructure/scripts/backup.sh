#!/usr/bin/env bash
# Nightly encrypted pg_dump → private R2 bucket (spec §19). Neon free keeps only ~6 h of history: this is the real safety net.
set -euo pipefail
: "${DATABASE_URL_UNPOOLED:?missing}" "${BACKUP_PASSPHRASE:?missing}" "${R2_BUCKET_BACKUPS:?missing}" "${CLOUDFLARE_ACCOUNT_ID:?missing}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/roi-${STAMP}.dump"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL_UNPOOLED" -f "$FILE"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$FILE" -out "$FILE.enc" -pass env:BACKUP_PASSPHRASE
rm -f "$FILE"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
  aws s3 cp "$FILE.enc" "s3://${R2_BUCKET_BACKUPS}/db/roi-${STAMP}.dump.enc" --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
echo "BACKUP: OK roi-${STAMP}.dump.enc ($(stat -c %s "$FILE.enc") bytes)"
rm -f "$FILE.enc"
