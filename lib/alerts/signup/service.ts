import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import { missingProfileInsert } from "@/lib/auth/profile-insert";
import type { Database } from "@/lib/db/database.types";
import { createEmailSender, type EmailSender } from "@/lib/email/send";
import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";
import { structuredLog } from "@/lib/observability/log";
import { emailSchema, parseInputSafe } from "@/lib/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderAlertConfirmationEmail } from "@/lib/alerts/signup/confirmation-email";
import { normalizeAlertEmail } from "@/lib/alerts/signup/normalize";
import {
  ALERT_SIGNUP_EMAIL_CONFIRM,
  ALERT_SIGNUP_IP_BURST,
  ALERT_SIGNUP_IP_DAILY,
  ALERT_SIGNUP_MAX_PER_EMAIL,
  hitAlertSignupRateLimit,
} from "@/lib/alerts/signup/rate-limit-db";
import { resolvePublicAlertScope } from "@/lib/alerts/signup/resolve-preview";
import {
  AlertTokenSecretMissingError,
  hashAlertToken,
  mintConfirmToken,
  mintUnsubscribeToken,
  verifyUnsubscribeTokenAny,
} from "@/lib/alerts/signup/tokens";

type Admin = SupabaseClient<Database>;

export type SignupBody = {
  email?: unknown;
  dealSlug?: unknown;
  consent?: unknown;
  source?: unknown;
  website?: unknown;
};

export type SignupHttpResult =
  | { status: 202; body: { status: "pending" } }
  | { status: 400; body: { error: "INVALID_EMAIL" | "CONSENT_REQUIRED" } }
  | { status: 429; body: { error: "RATE_LIMITED" }; retryAfter: number };

type SubscriptionRow = {
  id: string;
  email_normalized: string;
  status: "pending" | "active" | "unsubscribed";
  main_category: string | null;
  broad_region: string | null;
  user_id: string | null;
  confirm_token_hash: string | null;
  confirm_expires_at: string | null;
  unsubscribe_token_hash: string;
  confirmation_email_count: number;
  last_confirmation_sent_at: string | null;
};

function emailFingerprint(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function pendingOk(): SignupHttpResult {
  return { status: 202, body: { status: "pending" } };
}

function hasTokenSecret(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.ALERT_TOKEN_SECRET?.trim().length ?? 0) >= 32;
}

export async function handleAlertSignup(input: {
  request: Request;
  body: SignupBody;
  admin?: Admin;
  sender?: EmailSender;
  env?: Record<string, string | undefined>;
  now?: Date;
}): Promise<SignupHttpResult> {
  const env = input.env ?? process.env;
  const admin = input.admin ?? createSupabaseAdminClient();
  const now = input.now ?? new Date();

  // Honeypot: treat as success without side effects.
  if (typeof input.body.website === "string" && input.body.website.trim() !== "") {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_honeypot",
    });
    return pendingOk();
  }

  if (input.body.consent !== true) {
    return { status: 400, body: { error: "CONSENT_REQUIRED" } };
  }

  const normalized = normalizeAlertEmail(input.body.email);
  const emailParsed = normalized
    ? parseInputSafe(emailSchema, normalized)
    : null;
  if (!emailParsed?.success) {
    return { status: 400, body: { error: "INVALID_EMAIL" } };
  }
  const email = emailParsed.data;

  const ip = clientIp(input.request);
  const burst = await hitAlertSignupRateLimit(
    admin,
    `alert-signup:ip-burst:${ip}`,
    ALERT_SIGNUP_IP_BURST.limit,
    ALERT_SIGNUP_IP_BURST.windowSeconds,
  );
  if (!burst.ok) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_ip_burst_limited",
    });
    return {
      status: 429,
      body: { error: "RATE_LIMITED" },
      retryAfter: Math.max(1, Math.ceil((burst.resetAt - Date.now()) / 1000)),
    };
  }
  const daily = await hitAlertSignupRateLimit(
    admin,
    `alert-signup:ip-day:${ip}`,
    ALERT_SIGNUP_IP_DAILY.limit,
    ALERT_SIGNUP_IP_DAILY.windowSeconds,
  );
  if (!daily.ok) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_ip_daily_limited",
    });
    return {
      status: 429,
      body: { error: "RATE_LIMITED" },
      retryAfter: Math.max(1, Math.ceil((daily.resetAt - Date.now()) / 1000)),
    };
  }

  if (!hasTokenSecret(env)) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_missing_token_secret",
      level: "error",
    });
    return pendingOk();
  }

  const dealSlug =
    typeof input.body.dealSlug === "string" ? input.body.dealSlug : null;
  const scope = await resolvePublicAlertScope(admin, dealSlug);

  const { count, error: countError } = await admin
    .from("alert_email_subscriptions" as never)
    .select("id", { count: "exact", head: true })
    .eq("email_normalized" as never, email)
    .in("status" as never, ["pending", "active"] as never);

  if (countError) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_count_failed",
      level: "error",
    });
    return pendingOk();
  }
  if ((count ?? 0) >= ALERT_SIGNUP_MAX_PER_EMAIL) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_email_cap",
      fingerprint: emailFingerprint(email),
    });
    return pendingOk();
  }

  const emailConfirmGate = await hitAlertSignupRateLimit(
    admin,
    `alert-signup:email-confirm:${emailFingerprint(email)}`,
    ALERT_SIGNUP_EMAIL_CONFIRM.limit,
    ALERT_SIGNUP_EMAIL_CONFIRM.windowSeconds,
  );

  let confirm: { token: string; hash: string; expiresAt: Date };
  let unsubHash: string;
  try {
    confirm = mintConfirmToken(env);
    // Provisional id for unsub hash — re-mint after insert with real id.
    unsubHash = hashAlertToken(`pending:${confirm.token}`, env);
  } catch (error) {
    if (error instanceof AlertTokenSecretMissingError) {
      structuredLog({
        job: "alert-signup",
        msg: "alert_signup_missing_token_secret",
        level: "error",
      });
      return pendingOk();
    }
    throw error;
  }

  const source =
    input.body.source === "deal_page" || input.body.source == null
      ? "deal_page"
      : "deal_page";

  const { data: inserted, error: insertError } = await admin
    .from("alert_email_subscriptions" as never)
    .insert({
      email_normalized: email,
      status: "pending",
      main_category: scope.mainCategory,
      broad_region: scope.broadRegion,
      source,
      confirm_token_hash: confirm.hash,
      confirm_expires_at: confirm.expiresAt.toISOString(),
      unsubscribe_token_hash: unsubHash,
      confirmation_email_count: 0,
    } as never)
    .select("id")
    .single();

  if (insertError || !inserted) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_insert_failed",
      level: "error",
    });
    return pendingOk();
  }

  const subscriptionId = (inserted as { id: string }).id;
  try {
    const minted = mintUnsubscribeToken(subscriptionId, env);
    await admin
      .from("alert_email_subscriptions" as never)
      .update({ unsubscribe_token_hash: minted.hash } as never)
      .eq("id" as never, subscriptionId);
  } catch {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_unsub_token_failed",
      level: "error",
    });
    return pendingOk();
  }

  if (!emailConfirmGate.ok) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_email_confirm_capped",
      fingerprint: emailFingerprint(email),
    });
    return pendingOk();
  }

  const appUrl = (
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    getPublicEnv().NEXT_PUBLIC_APP_URL
  ).replace(/\/$/, "");
  const confirmUrl = `${appUrl}/api/alerts/confirm?token=${encodeURIComponent(confirm.token)}`;
  const rendered = renderAlertConfirmationEmail({
    appUrl,
    confirmUrl,
    categoryName: scope.mainCategory,
  });
  const sender = input.sender ?? createEmailSender();
  try {
    try {
      void getServerEnv();
    } catch {
      // Sender may still work with injected/mocked transport in tests.
    }
    await sender.send({
      to: email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    await admin
      .from("alert_email_subscriptions" as never)
      .update({
        confirmation_email_count: 1,
        last_confirmation_sent_at: now.toISOString(),
      } as never)
      .eq("id" as never, subscriptionId);
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_confirmation_queued",
      fingerprint: emailFingerprint(email),
      hasCategory: Boolean(scope.mainCategory),
    });
  } catch {
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_confirmation_send_failed",
      level: "error",
      fingerprint: emailFingerprint(email),
    });
  }

  return pendingOk();
}

async function ensureFreeAlertUser(
  admin: Admin,
  email: string,
): Promise<string | null> {
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile?.id) {
    await ensureProfileAndPrefs(admin, existingProfile.id, email);
    return existingProfile.id;
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { alert_signup: true },
    });
  if (createError || !created.user) {
    // Race: profile may have appeared; retry profile lookup once.
    const { data: raced } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (raced?.id) {
      await ensureProfileAndPrefs(admin, raced.id, email);
      return raced.id;
    }
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_create_user_failed",
      level: "error",
    });
    return null;
  }
  await ensureProfileAndPrefs(admin, created.user.id, email);
  return created.user.id;
}

async function ensureProfileAndPrefs(
  admin: Admin,
  userId: string,
  email: string,
): Promise<void> {
  const profile = missingProfileInsert({ id: userId, email });
  await admin.from("profiles").upsert(profile as never, { onConflict: "id" });
  await admin.from("notification_preferences").upsert(
    {
      user_id: userId,
      email_enabled: true,
      new_match_enabled: true,
      deal_change_enabled: true,
      deadline_enabled: true,
      renewal_enabled: true,
      digest_cadence: "DAILY",
    } as never,
    { onConflict: "user_id" },
  );
}

async function ensureSavedSearch(
  admin: Admin,
  userId: string,
  mainCategory: string | null,
  broadRegion: string | null,
): Promise<void> {
  if (!mainCategory && !broadRegion) {
    return;
  }
  const filters: Record<string, string> = {};
  if (mainCategory) {
    filters.category = mainCategory;
  }
  if (broadRegion) {
    filters.region = broadRegion;
  }
  const name = mainCategory
    ? `${mainCategory} alerts`
    : "Opportunity alerts";
  const { data: existing } = await admin
    .from("saved_searches")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  if (existing?.id) {
    await admin
      .from("saved_searches")
      .update({
        filters,
        enabled: true,
        alert_cadence: "DAILY",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", existing.id);
    return;
  }
  await admin.from("saved_searches").insert({
    user_id: userId,
    name: name.slice(0, 80),
    filters,
    alert_cadence: "DAILY",
    enabled: true,
  } as never);
}

export async function handleAlertConfirm(input: {
  token: string | null;
  admin?: Admin;
  env?: Record<string, string | undefined>;
  now?: Date;
}): Promise<{ redirectTo: string }> {
  const invalid = "/alerts/confirmed?status=invalid";
  const ok = "/alerts/confirmed";
  const env = input.env ?? process.env;
  const admin = input.admin ?? createSupabaseAdminClient();
  const now = input.now ?? new Date();
  const token = input.token?.trim() ?? "";
  if (!token || !hasTokenSecret(env)) {
    return { redirectTo: invalid };
  }

  let hash: string;
  try {
    hash = hashAlertToken(token, env);
  } catch {
    return { redirectTo: invalid };
  }

  const { data, error } = await admin
    .from("alert_email_subscriptions" as never)
    .select(
      "id, email_normalized, status, main_category, broad_region, user_id, confirm_token_hash, confirm_expires_at, unsubscribe_token_hash, confirmation_email_count, last_confirmation_sent_at",
    )
    .eq("confirm_token_hash" as never, hash)
    .maybeSingle();

  if (error || !data) {
    // Idempotent: already confirmed (token cleared) — cannot look up by hash.
    // Treat unknown token as invalid.
    return { redirectTo: invalid };
  }

  const row = data as SubscriptionRow;
  if (row.status === "unsubscribed") {
    return { redirectTo: invalid };
  }
  if (row.status === "active") {
    return { redirectTo: ok };
  }
  if (
    !row.confirm_expires_at ||
    Date.parse(row.confirm_expires_at) < now.getTime()
  ) {
    return { redirectTo: invalid };
  }

  const userId =
    row.user_id ?? (await ensureFreeAlertUser(admin, row.email_normalized));
  if (!userId) {
    return { redirectTo: invalid };
  }

  await ensureSavedSearch(
    admin,
    userId,
    row.main_category,
    row.broad_region,
  );

  // Keep confirm_token_hash so a second click stays idempotent (status already active).
  const { error: updateError } = await admin
    .from("alert_email_subscriptions" as never)
    .update({
      status: "active",
      user_id: userId,
      confirmed_at: now.toISOString(),
    } as never)
    .eq("id" as never, row.id);

  if (updateError) {
    structuredLog({
      job: "alert-signup",
      msg: "alert_confirm_update_failed",
      level: "error",
    });
    return { redirectTo: invalid };
  }

  structuredLog({
    job: "alert-signup",
    msg: "alert_signup_confirmed",
    fingerprint: emailFingerprint(row.email_normalized),
  });
  return { redirectTo: ok };
}

export async function handleAlertUnsubscribe(input: {
  token: string | null;
  admin?: Admin;
  env?: Record<string, string | undefined>;
  now?: Date;
}): Promise<{ redirectTo: string }> {
  const dest = "/alerts/unsubscribed";
  const env = input.env ?? process.env;
  const admin = input.admin ?? createSupabaseAdminClient();
  const now = input.now ?? new Date();
  const token = input.token?.trim() ?? "";
  if (!token || !hasTokenSecret(env)) {
    return { redirectTo: dest };
  }

  let verified:
    | { kind: "subscription"; subscriptionId: string }
    | { kind: "user"; userId: string }
    | null = null;
  try {
    verified = verifyUnsubscribeTokenAny(token, env);
  } catch {
    return { redirectTo: dest };
  }
  if (!verified) {
    return { redirectTo: dest };
  }

  if (verified.kind === "user") {
    await admin
      .from("notification_preferences")
      .update({ email_enabled: false })
      .eq("user_id", verified.userId);
    await admin
      .from("alert_email_subscriptions" as never)
      .update({
        status: "unsubscribed",
        unsubscribed_at: now.toISOString(),
        confirm_token_hash: null,
        confirm_expires_at: null,
      } as never)
      .eq("user_id" as never, verified.userId)
      .neq("status" as never, "unsubscribed");
    structuredLog({
      job: "alert-signup",
      msg: "alert_signup_unsubscribed",
    });
    return { redirectTo: dest };
  }

  const hash = hashAlertToken(token, env);
  const { data } = await admin
    .from("alert_email_subscriptions" as never)
    .select("id, status, user_id, unsubscribe_token_hash")
    .eq("id" as never, verified.subscriptionId)
    .maybeSingle();

  if (!data) {
    return { redirectTo: dest };
  }
  const row = data as Pick<
    SubscriptionRow,
    "id" | "status" | "user_id" | "unsubscribe_token_hash"
  >;
  if (row.unsubscribe_token_hash !== hash) {
    return { redirectTo: dest };
  }
  if (row.status === "unsubscribed") {
    return { redirectTo: dest };
  }

  await admin
    .from("alert_email_subscriptions" as never)
    .update({
      status: "unsubscribed",
      unsubscribed_at: now.toISOString(),
      confirm_token_hash: null,
      confirm_expires_at: null,
    } as never)
    .eq("id" as never, row.id);

  if (row.user_id) {
    await admin
      .from("notification_preferences")
      .update({ email_enabled: false })
      .eq("user_id", row.user_id);
  }

  structuredLog({
    job: "alert-signup",
    msg: "alert_signup_unsubscribed",
  });
  return { redirectTo: dest };
}
