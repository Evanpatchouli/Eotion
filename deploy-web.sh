#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only origin master

export GIT_SHA="$(git rev-parse --short=12 HEAD)"

docker compose up -d --build eotion-web

docker compose ps eotion-web

for attempt in {1..20}; do
  if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:8001/; then
    echo "Eotion Web deployed successfully (git: $GIT_SHA)."
    exit 0
  fi
  sleep 1
done

echo "Eotion Web did not become ready after 20 seconds." >&2
docker compose logs --tail=100 eotion-web >&2 || true
exit 1
