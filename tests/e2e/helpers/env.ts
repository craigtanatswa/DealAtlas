import { spawnSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export type SupabaseTestEnv = {
  url: string;
  anonKey: string;
  secretKey: string;
};

function fromDealAtlasTestEnv(): SupabaseTestEnv | null {
  const url = process.env.DEALATLAS_DB_TEST_URL;
  const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY;
  const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY;
  if (!url || !anonKey || !secretKey) {
    return null;
  }
  return { url, anonKey, secretKey };
}

export function fromSupabaseStatus(): SupabaseTestEnv {
  const result = spawnSync(
    "npx",
    ["supabase", "status", "--output", "json", "--log-level", "error"],
    { encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        "Local Supabase is not running. Start it before Playwright.",
    );
  }
  const raw = (result.stdout || "").trim();
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("supabase status did not return JSON.");
  }
  const parsed = JSON.parse(raw.slice(jsonStart)) as Record<string, string>;
  const url = parsed.API_URL || parsed.SUPABASE_URL;
  const anonKey =
    parsed.ANON_KEY || parsed.PUBLISHABLE_KEY || parsed.SUPABASE_ANON_KEY;
  const secretKey =
    parsed.SERVICE_ROLE_KEY ||
    parsed.SECRET_KEY ||
    parsed.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !secretKey) {
    throw new Error("Could not read local Supabase URL and keys.");
  }
  return { url, anonKey, secretKey };
}

export function requireSupabaseEnv(): SupabaseTestEnv {
  return fromDealAtlasTestEnv() ?? fromSupabaseStatus();
}

export function bindLocalSupabaseEnv(
  env: SupabaseTestEnv = requireSupabaseEnv(),
): SupabaseTestEnv {
  process.env.DEALATLAS_DB_TEST_URL = env.url;
  process.env.DEALATLAS_DB_TEST_ANON_KEY = env.anonKey;
  process.env.DEALATLAS_DB_TEST_SECRET_KEY = env.secretKey;
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.anonKey;
  process.env.SUPABASE_SECRET_KEY = env.secretKey;
  return env;
}
