#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only origin master

if ! docker network inspect public-web >/dev/null 2>&1; then
  echo "Missing external Docker network: public-web" >&2
  echo "Deploy/recreate the edge nginx stack first." >&2
  exit 1
fi

export GIT_SHA="$(git rev-parse --short=12 HEAD)"

docker compose up -d --build eotion-site

docker compose ps eotion-site

for attempt in {1..20}; do
  if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:8002/; then
    echo "Eotion Site deployed successfully (git: $GIT_SHA)."
    exit 0
  fi
  sleep 1
done

echo "Eotion Site did not become ready after 20 seconds." >&2
docker compose logs --tail=100 eotion-site >&2 || true
exit 1
