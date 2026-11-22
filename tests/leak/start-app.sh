#!/usr/bin/env bash
# Starts the already-built app on 127.0.0.1:3100 for one leak-probe phase and
# records .next/BUILD_ID as .leak/build-id-<phase> (spec 1.2 steps 6 and 10).
# Server env mirrors the playwright.config.ts webServer (Dodo test fixtures);
# RESEND_API_KEY stays unset.
#
#   tests/leak/start-app.sh <phase> <log-file>
set -euo pipefail

phase="${1:?phase (baseline, A or B)}"
log="${2:?log file}"
port=3100
app_url="http://127.0.0.1:${port}"
# Local-only fixture (not a real secret): lets the harness purge the ISR cache
# after seeding so a build-time prerender cannot hide the seeded rows.
revalidate_secret="leak-ci-revalidate-secret-not-real-0123456789"

# Never probe a stale server: if something already answers on the port (an
# app left over from an earlier phase), stop it first and refuse to continue
# if the port stays busy.
if curl -fsS -o /dev/null "${app_url}/api/health" 2>/dev/null; then
  echo "an app is already serving ${app_url}; stopping it before phase ${phase}" >&2
  if ! bash "$(dirname "$0")/stop-app.sh"; then
    echo "port ${port} is still in use; refusing to start phase ${phase}" >&2
    exit 1
  fi
fi

mkdir -p .leak
cp .next/BUILD_ID ".leak/build-id-${phase}"

env -u RESEND_API_KEY \
  PORT="$port" \
  NEXT_PUBLIC_APP_URL="$app_url" \
  DODO_PAYMENTS_WEBHOOK_KEY="whsec_dGVzdF9kb2RvX3dlYmhvb2tfc2VjcmV0X2tleQ" \
  DODO_PRO_MONTHLY_PRODUCT_ID="pdt_dealatlas_pro_monthly" \
  DODO_PRO_ANNUAL_PRODUCT_ID="pdt_dealatlas_pro_annual" \
  DODO_FOUNDING_LIFETIME_PRODUCT_ID="pdt_dealatlas_founding_lifetime" \
  DODO_PAYMENTS_RETURN_URL="${app_url}/checkout/success" \
  DODO_PAYMENTS_ENVIRONMENT="test_mode" \
  DODO_PAYMENTS_API_KEY="rk_test_e2e_placeholder" \
  REVALIDATE_SECRET="leak-ci-revalidate-secret-not-real-0123456789" \
  DEALATLAS_VIEWER_API_RATE_LIMIT="4000" \
  setsid nohup npx next start -H 127.0.0.1 -p "$port" >>"$log" 2>&1 &
echo $! > .leak/app.pid

for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "${app_url}/api/health"; then
    echo "app up for phase ${phase} (BUILD_ID $(cat ".leak/build-id-${phase}"))"
    if ! curl -fsS -X POST "${app_url}/api/internal/revalidate" \
      -H "Authorization: Bearer ${revalidate_secret}" \
      -H "Content-Type: application/json" \
      --data '{}' >/dev/null; then
      echo "failed to purge the ISR cache for phase ${phase}" >&2
      cat "$log"
      exit 1
    fi
    exit 0
  fi
  sleep 1
done
cat "$log"
exit 1
