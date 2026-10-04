#!/usr/bin/env bash
# Applies the synthetic world and the post-seed step as postgres, so the real
# preview gate decides publication (spec 1.2 steps 3 and 4). Needs DB_URL and
# .leak/users.json from users.ts.
set -euo pipefail
cd "$(dirname "$0")/../../.."

node -e '
  const host = new URL(process.env.DB_URL ?? "").hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    console.error(`DB_URL must be a loopback host for the leak seed, got ${host}`);
    process.exit(1);
  }'

id() { jq -r ".${1}.id" .leak/users.json; }
psql "${DB_URL:?DB_URL}" -q -v ON_ERROR_STOP=1 \
  -v free_id="$(id free)" -v free_lapsed_id="$(id free_lapsed)" \
  -v free_expired_id="$(id free_expired)" -v pro_id="$(id pro)" \
  -v include_residuals="${LEAK_INCLUDE_RESIDUALS:-0}" \
  -f tests/leak/seed/world.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -v outcome_path=.leak/seed-outcome.json -f tests/leak/seed/post-seed.sql
echo "seeded; outcome in .leak/seed-outcome.json"
