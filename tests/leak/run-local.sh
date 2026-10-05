#!/usr/bin/env bash
# Runs the whole leak-probe job against a throwaway LOCAL Supabase stack, in
# the same order as the "Leak regression (local)" CI job (spec 1.2). It wipes
# the local stack (supabase stop --no-backup). Never point it at a hosted
# project: every harness entry point aborts unless all hosts are loopback.
#
#   tests/leak/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

held="$(mktemp -d)"
restore() {
  tests/leak/stop-app.sh || true
  if compgen -G "$held/0019_*.sql" >/dev/null; then mv "$held"/0019_*.sql supabase/migrations/; fi
}
trap restore EXIT

npx supabase stop --no-backup >/dev/null 2>&1 || true
mv supabase/migrations/0019_*.sql "$held/"
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,realtime,storage-api

status="$(npx supabase status --output json --log-level error)"
status="${status#"${status%%\{*}"}"
export NEXT_PUBLIC_SUPABASE_URL="$(jq -r '.API_URL' <<<"$status")"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(jq -r '.PUBLISHABLE_KEY // .ANON_KEY' <<<"$status")"
export SUPABASE_SECRET_KEY="$(jq -r '.SECRET_KEY // .SERVICE_ROLE_KEY' <<<"$status")"
export DEALATLAS_DB_TEST_URL="$NEXT_PUBLIC_SUPABASE_URL"
export DEALATLAS_DB_TEST_ANON_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
export DEALATLAS_DB_TEST_SECRET_KEY="$SUPABASE_SECRET_KEY"
export DEALATLAS_DB_TEST_DB_URL="$(jq -r '.DB_URL' <<<"$status")"
export DB_URL="$DEALATLAS_DB_TEST_DB_URL"
node scripts/ci-guard-env.mjs

rm -rf leak-artifacts .leak
mkdir -p .leak
date -u +%Y-%m-%dT%H:%M:%SZ > .leak/started-at
log=.leak/next-start.log

NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100 NEXT_PUBLIC_GA_MEASUREMENT_ID=G-ZQLEAKTEST0 npm run build

tests/leak/start-app.sh baseline "$log"
npx tsx tests/leak/preflight.ts --baseline
tests/leak/stop-app.sh

npx tsx tests/leak/seed/users.ts
tests/leak/seed/apply.sh

tests/leak/start-app.sh A "$log"
npx tsx --import ./scripts/allow-server-only.mjs tests/leak/preflight.ts
npx tsx --import ./scripts/allow-server-only.mjs tests/leak/run.ts --phase A
tests/leak/stop-app.sh

mv "$held"/0019_*.sql supabase/migrations/
npx supabase migration up --local
tests/leak/start-app.sh B "$log"
npx tsx --import ./scripts/allow-server-only.mjs tests/leak/run.ts --phase B
tests/leak/stop-app.sh

npx tsx tests/leak/report.ts
