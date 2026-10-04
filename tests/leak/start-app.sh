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

mkdir -p .leak
cp .next/BUILD_ID ".leak/build-id-${phase}"

env -u RESEND_API_KEY \
  PORT="$port" \
  NEXT_PUBLIC_APP_URL="$app_url" \
  DODO_PAYMENTS_WEBHOOK_KEY="whsec_dGVzdF9kb2RvX3dlYmhvb2tfc2VjcmV0X2tleQ" \
  DODO_PRO_MONTHLY_PRODUCT_ID="pdt_dealatlas_pro_monthly" \
  DODO_PRO_ANNUAL_PRODUCT_ID="pdt_dealatlas_pro_annual" \
  DODO_PAYMENTS_RETURN_URL="${app_url}/checkout/success" \
  DODO_PAYMENTS_ENVIRONMENT="test_mode" \
  DODO_PAYMENTS_API_KEY="rk_test_e2e_placeholder" \
  setsid nohup npx next start -H 127.0.0.1 -p "$port" >>"$log" 2>&1 &
echo $! > .leak/app.pid

for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "${app_url}/api/health"; then
    echo "app up for phase ${phase} (BUILD_ID $(cat ".leak/build-id-${phase}"))"
    exit 0
  fi
  sleep 1
done
cat "$log"
exit 1
