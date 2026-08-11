#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:?Set APP_ROOT to the Hostinger application root.}"
RELEASE_ID="${RELEASE_ID:?Set RELEASE_ID to the Git commit SHA.}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
SHARED_DIR="$APP_ROOT/shared"
SHARED_ENV="$SHARED_DIR/.env"

test -d "$RELEASE_DIR" || { echo "Release directory does not exist: $RELEASE_DIR" >&2; exit 1; }
mkdir -p "$SHARED_DIR" "$SHARED_DIR/storage" "$SHARED_DIR/public-uploads" "$APP_ROOT/backups"
chmod 700 "$SHARED_DIR" "$APP_ROOT/backups" 2>/dev/null || true

# The immutable-release layout was introduced after some HOAHub installations were
# already running. On first adoption, migrate the existing HOAHub runtime config
# into shared/.env without printing any environment values into deployment logs.
if [ ! -f "$SHARED_ENV" ]; then
  if [ -f "$APP_ROOT/.env" ]; then
    cp "$APP_ROOT/.env" "$SHARED_ENV"
    chmod 600 "$SHARED_ENV"
    echo "Bootstrapped shared environment from the existing application root."
  fi
fi

if [ ! -f "$SHARED_ENV" ] && command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  LEGACY_CWD="$(pm2 jlist 2>/dev/null | node -e '
    let input="";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(input || "[]");
        const app = apps.find((item) => item?.name === "hoahub");
        process.stdout.write(app?.pm2_env?.pm_cwd || "");
      } catch {}
    });
  ' || true)"
  if [ -n "$LEGACY_CWD" ] && [ "$LEGACY_CWD" != "$RELEASE_DIR" ] && [ -f "$LEGACY_CWD/.env" ]; then
    cp "$LEGACY_CWD/.env" "$SHARED_ENV"
    chmod 600 "$SHARED_ENV"
    echo "Bootstrapped shared environment from the existing HOAHub PM2 release."
  fi
fi

# Some Hostinger installations inject configuration directly into the PM2 process
# instead of keeping an application .env file. Preserve only keys that HOAHub
# explicitly declares in .env.example, and require the two critical secrets before
# accepting the generated file. Values are written locally on the server and are
# never echoed to the CI log.
if [ ! -f "$SHARED_ENV" ] && command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  TMP_ENV="$SHARED_DIR/.env.bootstrap.$$"
  export HOAHUB_ENV_TEMPLATE="$RELEASE_DIR/.env.example"
  export HOAHUB_ENV_TARGET="$TMP_ENV"
  if pm2 jlist 2>/dev/null | node -e '
    const fs = require("fs");
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(input || "[]");
        const app = apps.find((item) => item?.name === "hoahub");
        const env = app?.pm2_env || {};
        if (!env.DATABASE_URL || !env.AUTH_SECRET) process.exit(2);
        const template = fs.readFileSync(process.env.HOAHUB_ENV_TEMPLATE, "utf8");
        const keys = [...new Set(template.split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean))];
        const quote = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/"/g, "\\\"")}"`;
        const lines = keys.filter((key) => env[key] !== undefined).map((key) => `${key}=${quote(env[key])}`);
        fs.writeFileSync(process.env.HOAHUB_ENV_TARGET, lines.join("\n") + "\n", { mode: 0o600 });
      } catch {
        process.exit(3);
      }
    });
  '; then
    mv "$TMP_ENV" "$SHARED_ENV"
    chmod 600 "$SHARED_ENV"
    echo "Bootstrapped shared environment from the existing HOAHub PM2 runtime."
  else
    rm -f "$TMP_ENV"
  fi
  unset HOAHUB_ENV_TEMPLATE HOAHUB_ENV_TARGET
fi

if [ ! -f "$SHARED_ENV" ]; then
  echo "Production environment bootstrap is incomplete: $SHARED_ENV does not exist." >&2
  echo "Create it once using the production values documented in .env.example, then rerun the failed deployment job." >&2
  echo "No environment values were logged or generated from placeholders." >&2
  exit 1
fi

ln -sfn "$SHARED_ENV" "$RELEASE_DIR/.env"
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
