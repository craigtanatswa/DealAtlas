import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

import {
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_WEBHOOK_SECRET,
} from "./lib/billing/fixtures";
import { bindLocalSupabaseEnv, fromSupabaseStatus } from "./tests/e2e/helpers/env";

loadEnvConfig(process.cwd());

const PORT = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const supabase = bindLocalSupabaseEnv(fromSupabaseStatus());
process.env.NEXT_PUBLIC_APP_URL = baseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
      SUPABASE_SECRET_KEY: supabase.secretKey,
      DEALATLAS_DB_TEST_URL: supabase.url,
      DEALATLAS_DB_TEST_ANON_KEY: supabase.anonKey,
      DEALATLAS_DB_TEST_SECRET_KEY: supabase.secretKey,
      DODO_PAYMENTS_WEBHOOK_KEY: BILLING_FIXTURE_WEBHOOK_SECRET,
      DODO_PRO_MONTHLY_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
      DODO_PRO_ANNUAL_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      DODO_PAYMENTS_RETURN_URL: `${baseURL}/checkout/success`,
      DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      DODO_PAYMENTS_API_KEY:
        process.env.DODO_PAYMENTS_API_KEY || "rk_test_e2e_placeholder",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
