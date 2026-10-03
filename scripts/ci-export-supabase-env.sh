#!/usr/bin/env bash
# Reads the local Supabase stack's URL/keys and exports them to later CI steps.
# Values come from the throwaway stack in the runner, never from repo secrets.
set -euo pipefail

status="$(npx supabase status --output json --log-level error)"
status="${status#"${status%%\{*}"}"

url="$(jq -r '.API_URL // .SUPABASE_URL' <<<"$status")"
anon="$(jq -r '.PUBLISHABLE_KEY // .ANON_KEY // .SUPABASE_ANON_KEY' <<<"$status")"
secret="$(jq -r '.SECRET_KEY // .SERVICE_ROLE_KEY // .SUPABASE_SERVICE_ROLE_KEY' <<<"$status")"

for value in "$url" "$anon" "$secret"; do
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo "Could not read local Supabase URL and keys from 'supabase status'." >&2
    exit 1
  fi
done

echo "::add-mask::$anon"
echo "::add-mask::$secret"

{
  echo "NEXT_PUBLIC_SUPABASE_URL=$url"
  echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$anon"
  echo "SUPABASE_SECRET_KEY=$secret"
  echo "DEALATLAS_DB_TEST_URL=$url"
  echo "DEALATLAS_DB_TEST_ANON_KEY=$anon"
  echo "DEALATLAS_DB_TEST_SECRET_KEY=$secret"
} >> "${GITHUB_ENV:?GITHUB_ENV must be set}"
