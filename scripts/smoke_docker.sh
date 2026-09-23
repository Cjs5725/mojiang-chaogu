#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
    docker compose down --remove-orphans -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    docker compose build mojiang-web
fi
docker compose up -d --no-build mojiang-web

for _ in $(seq 1 45); do
    if curl --fail --silent http://127.0.0.1:8000/api/health >/tmp/mojiang-health.json; then
        break
    fi
    sleep 1
done

if ! curl --fail --silent http://127.0.0.1:8000/api/health >/dev/null; then
    docker compose ps
    docker compose logs mojiang-web
    exit 1
fi

curl --fail --silent http://127.0.0.1:8000/api/health | grep '"ok":true' >/dev/null
curl --fail --silent http://127.0.0.1:8000/ | grep '<div id="app">' >/dev/null

container_user="$(docker compose exec -T mojiang-web id -u)"
test "$container_user" != "0"

docker compose exec -T mojiang-web sh -c 'test -w /app/data'

echo "Docker smoke test passed"
