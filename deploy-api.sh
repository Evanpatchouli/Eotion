#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

git pull --ff-only origin master
pnpm version:check

export GIT_SHA="$(git rev-parse --short=12 HEAD)"

docker compose up -d --build eotion-api

docker compose ps eotion-api

for attempt in {1..20}; do
  if docker compose exec -T eotion-api node -e "fetch('http://127.0.0.1:7137/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
    echo "Eotion API deployed successfully (git: $GIT_SHA)."
    exit 0
  fi
  sleep 1
done

echo "Eotion API did not become ready after 20 seconds." >&2
docker compose logs --tail=100 eotion-api >&2 || true
exit 1
