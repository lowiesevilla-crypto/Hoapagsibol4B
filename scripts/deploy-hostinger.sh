#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:?Set APP_ROOT to the Hostinger application root.}"
RELEASE_ID="${RELEASE_ID:?Set RELEASE_ID to the Git commit SHA.}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
SHARED_DIR="$APP_ROOT/shared"

test -d "$RELEASE_DIR" || { echo "Release directory does not exist: $RELEASE_DIR" >&2; exit 1; }
test -f "$SHARED_DIR/.env" || { echo "Create $SHARED_DIR/.env before the first deployment." >&2; exit 1; }
mkdir -p "$SHARED_DIR/storage" "$SHARED_DIR/public-uploads" "$APP_ROOT/backups"
ln -sfn "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
rm -rf "$RELEASE_DIR/storage" "$RELEASE_DIR/public/uploads"
ln -sfn "$SHARED_DIR/storage" "$RELEASE_DIR/storage"
mkdir -p "$RELEASE_DIR/public"
ln -sfn "$SHARED_DIR/public-uploads" "$RELEASE_DIR/public/uploads"

RELEASE_DIR="$RELEASE_DIR" APP_ROOT="$APP_ROOT" bash "$RELEASE_DIR/scripts/backup-production.sh"
cd "$RELEASE_DIR"
corepack enable
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm build

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.new"
mv -Tf "$APP_ROOT/current.new" "$APP_ROOT/current"
cd "$APP_ROOT/current"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf --
echo "Deployment completed: $RELEASE_ID"
