import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { structuredLog } from "@/lib/observability/log";

export type AlertSignupRateResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

type Admin = SupabaseClient<Database>;

/**
 * Atomic Postgres rate limit via private.hit_alert_signup_rate_limit.
 * Fail closed (deny) when the RPC is unavailable.
 */
export async function hitAlertSignupRateLimit(
  admin: Admin,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<AlertSignupRateResult> {
  const { data, error } = await admin.rpc("hit_alert_signup_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_rate_limit_rpc_failed",
      level: "error",
    });
    return { ok: false, remaining: 0, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as { allowed?: unknown }).allowed !== "boolean"
  ) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_rate_limit_bad_payload",
      level: "error",
    });
    return { ok: false, remaining: 0, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const typed = row as {
    allowed: boolean;
    remaining: number;
    reset_at: string;
  };
  const resetAt = Date.parse(typed.reset_at);
  return {
    ok: typed.allowed,
    remaining: Math.max(0, Number(typed.remaining) || 0),
    resetAt: Number.isFinite(resetAt) ? resetAt : Date.now() + windowSeconds * 1000,
  };
}

export const ALERT_SIGNUP_IP_BURST = {
  limit: 5,
  windowSeconds: 10 * 60,
} as const;

export const ALERT_SIGNUP_IP_DAILY = {
  limit: 20,
  windowSeconds: 24 * 60 * 60,
} as const;

export const ALERT_SIGNUP_EMAIL_CONFIRM = {
  limit: 3,
  windowSeconds: 24 * 60 * 60,
} as const;

export const ALERT_SIGNUP_MAX_PER_EMAIL = 10;
