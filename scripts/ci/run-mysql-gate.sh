#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MYSQL_PORT="${MYSQL_PORT:-3307}"
MYSQL_DATABASE="${MYSQL_DATABASE:-hoahub_ci}"
MYSQL_USER="${MYSQL_USER:-hoahub_ci}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-hoahub_ci_pw}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root_pw}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.4}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-hoahub-ci-mysql}"
DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${MYSQL_PORT}/${MYSQL_DATABASE}"

cleanup() {
  docker rm -f "$MYSQL_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker run -d --name "$MYSQL_CONTAINER" \
  -e MYSQL_DATABASE="$MYSQL_DATABASE" \
  -e MYSQL_USER="$MYSQL_USER" \
  -e MYSQL_PASSWORD="$MYSQL_PASSWORD" \
  -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
  -p "${MYSQL_PORT}:3306" \
  "$MYSQL_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec "$MYSQL_CONTAINER" mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null

export DATABASE_URL
pnpm exec prisma migrate deploy
pnpm test:db
