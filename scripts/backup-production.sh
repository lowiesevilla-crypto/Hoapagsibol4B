#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:?Set APP_ROOT to the Hostinger application root.}"
ENV_FILE="$APP_ROOT/shared/.env"
BACKUP_ROOT="${BACKUP_ROOT:-$APP_ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="${RELEASE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

test -f "$ENV_FILE" || { echo "Missing production environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
eval "$(node "$RELEASE_DIR/scripts/database-url-env.mjs")"

mkdir -p "$BACKUP_ROOT/$STAMP"
MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --routines --triggers --set-gtid-purged=OFF \
  "$DB_NAME" | gzip -9 > "$BACKUP_ROOT/$STAMP/database.sql.gz"

if test -d "$APP_ROOT/shared/storage" || test -d "$APP_ROOT/shared/public-uploads"; then
  tar -czf "$BACKUP_ROOT/$STAMP/uploads.tar.gz" -C "$APP_ROOT/shared" storage public-uploads 2>/dev/null || true
fi
printf '%s\n' "$STAMP" > "$BACKUP_ROOT/latest"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_RETENTION_DAYS:-30}" -exec rm -rf -- {} +
echo "Backup completed: $BACKUP_ROOT/$STAMP"
