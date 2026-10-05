import fs from "node:fs";
import path from "node:path";

import { assertSafeDbTestTargets } from "../../../scripts/db-target-guard.mjs";

export const ROOT = path.resolve(__dirname, "../../..");
export const LEAK_DIR = path.join(ROOT, ".leak");

export const LEAK_USERS = {
  free: "leakprobe-free@example.com",
  free_lapsed: "leakprobe-lapsed@example.com",
  free_expired: "leakprobe-expired@example.com",
  pro: "leakprobe-pro@example.com",
} as const;

/** Synthetic local-only password for the throwaway leak-probe users. */
export const LEAK_PASSWORD = "Leakprobe-Local-Only-2031!";

export type SignedInRole = keyof typeof LEAK_USERS;
export type LeakUsers = Record<SignedInRole, { id: string; email: string }>;

export type LeakEnv = {
  supabaseUrl: string;
  anonKey: string;
  secretKey: string;
  appUrl: string;
  dbUrl: string;
  mailUrl: string;
};

/**
 * The harness only ever talks to a loopback Supabase stack and a loopback app.
 * Any other host aborts before a single request is sent.
 */
export function readLeakEnv(): LeakEnv {
  const supabaseUrl = process.env.DEALATLAS_DB_TEST_URL ?? "";
  const anonKey = process.env.DEALATLAS_DB_TEST_ANON_KEY ?? "";
  const secretKey = process.env.DEALATLAS_DB_TEST_SECRET_KEY ?? "";
  const dbUrl = process.env.DB_URL ?? "";
  const appUrl = (process.env.LEAK_APP_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
  const mailUrl = (process.env.LEAK_MAIL_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
  if (!supabaseUrl || !anonKey || !secretKey || !dbUrl) {
    throw new Error(
      "Set DEALATLAS_DB_TEST_URL, DEALATLAS_DB_TEST_ANON_KEY, DEALATLAS_DB_TEST_SECRET_KEY and DB_URL for the local Supabase stack.",
    );
  }
  assertSafeDbTestTargets([
    ["DEALATLAS_DB_TEST_URL", supabaseUrl],
    ["DB_URL", dbUrl],
    ["LEAK_APP_URL", appUrl],
    ["LEAK_MAIL_URL", mailUrl],
  ]);
  for (const [name, value] of [["DEALATLAS_DB_TEST_URL", supabaseUrl], ["DB_URL", dbUrl], ["LEAK_APP_URL", appUrl], ["LEAK_MAIL_URL", mailUrl]]) {
    const host = new URL(value).hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
      throw new Error(`${name} must be a loopback host for leak probes, got ${host}`);
    }
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), anonKey, secretKey, appUrl, dbUrl, mailUrl };
}

export function readUsers(): LeakUsers {
  return JSON.parse(fs.readFileSync(path.join(LEAK_DIR, "users.json"), "utf8")) as LeakUsers;
}
