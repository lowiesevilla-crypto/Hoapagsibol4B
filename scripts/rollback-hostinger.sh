#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:?Set APP_ROOT to the Hostinger application root.}"
RELEASE_ID="${1:?Usage: APP_ROOT=/path rollback-hostinger.sh RELEASE_ID [database.sql.gz]}"
TARGET="$APP_ROOT/releases/$RELEASE_ID"
test -d "$TARGET" || { echo "Unknown release: $TARGET" >&2; exit 1; }

ln -sfn "$TARGET" "$APP_ROOT/current.new"
mv -Tf "$APP_ROOT/current.new" "$APP_ROOT/current"
cd "$APP_ROOT/current"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

if test "${2:-}" != ""; then
  DUMP="$(realpath "$2")"
  test -f "$DUMP" || { echo "Database dump does not exist: $DUMP" >&2; exit 1; }
  set -a
  # shellcheck disable=SC1090
  source "$APP_ROOT/shared/.env"
  set +a
  eval "$(node scripts/database-url-env.mjs)"
  echo "Restoring the database from $DUMP"
  gzip -dc "$DUMP" | MYSQL_PWD="$DB_PASSWORD" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$DB_NAME"
fi
echo "Rollback completed: $RELEASE_ID"
