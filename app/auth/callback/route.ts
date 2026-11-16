import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  defaultPathForAuthType,
  resolveNextPath,
  resolveSignupNext,
} from "@/lib/auth/redirect";
import { parseEmailOtpType } from "@/lib/auth/otp";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_UTM_COOKIE,
  PASSWORD_RESET_COOKIE,
  SIGNUP_NEXT_COOKIE,
} from "@/lib/auth/cookies";
import { decodeOAuthUtm } from "@/lib/auth/oauth-utm";
import { ANALYTICS_ANON_ID_FIELD, ATTRIBUTION_FIELDS } from "@/lib/analytics/attribution";
import { serverAnalyticsConsentAllows } from "@/lib/analytics/consent";
import { captureServerEvent } from "@/lib/analytics/server";
import { buildIdentifyEvent, buildUserSignedUpEvent } from "@/lib/analytics/server-events";
import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/storage-keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NEW_ACCOUNT_WINDOW_MS = 60_000;

/** A Google account created by this sign-in (first sign-in at creation time). */
function isNewGoogleAccount(user: {
  app_metadata?: { provider?: unknown };
  created_at?: string;
  last_sign_in_at?: string;
} | null): boolean {
  if (!user || user.app_metadata?.provider !== "google") {
    return false;
  }
  const created = Date.parse(user.created_at ?? "");
  const lastSignIn = Date.parse(user.last_sign_in_at ?? "");
  return (
    Number.isFinite(created) &&
    Number.isFinite(lastSignIn) &&
    Math.abs(lastSignIn - created) < NEW_ACCOUNT_WINDOW_MS
  );
}

function errorRedirect(request: NextRequest, code: string) {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = `?error=${encodeURIComponent(code)}`;
  return NextResponse.redirect(url);
}

function safeNext(request: NextRequest, fallback: string) {
  return resolveNextPath(request.nextUrl.searchParams.get("next"), fallback);
}

type UserWithMetadata =
  | { user_metadata?: Record<string, unknown> | null }
  | null
  | undefined;

function signupNextFromMetadata(user: UserWithMetadata): string | null {
  const value = user?.user_metadata?.next;
  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = parseEmailOtpType(request.nextUrl.searchParams.get("type"));
  const cookieStore = await cookies();
  const pendingReset = cookieStore.get(PASSWORD_RESET_COOKIE);
  if (pendingReset) {
    cookieStore.delete(PASSWORD_RESET_COOKIE);
  }
  const pendingOAuthNext = cookieStore.get(OAUTH_NEXT_COOKIE);
  if (pendingOAuthNext) {
    cookieStore.delete(OAUTH_NEXT_COOKIE);
  }
  const pendingSignupNext = cookieStore.get(SIGNUP_NEXT_COOKIE);
  if (pendingSignupNext) {
    cookieStore.delete({ name: SIGNUP_NEXT_COOKIE, path: "/auth" });
  }
  const pendingOAuthUtm = cookieStore.get(OAUTH_UTM_COOKIE);
  if (pendingOAuthUtm) {
    cookieStore.delete(OAUTH_UTM_COOKIE);
  }

  const signupFlow =
    type === "signup" ||
    type === "invite" ||
    type === "email" ||
    type === "email_change" ||
    type === "magiclink";
  const signupType = type === "signup" || type === "email";
  const requestedNext = request.nextUrl.searchParams.get("next");
  const honorReset =
    type === "recovery" ||
    requestedNext === RESET_PASSWORD_PATH ||
    (Boolean(pendingReset) && !signupFlow);
  const oauthError = request.nextUrl.searchParams.get("error");
  const fallback = honorReset
    ? RESET_PASSWORD_PATH
    : pendingOAuthNext
      ? resolveNextPath(pendingOAuthNext.value)
      : defaultPathForAuthType(type);

  if (oauthError) {
    const cancelled = oauthError === "access_denied";
    return errorRedirect(
      request,
      type === "recovery"
        ? "reset_failed"
        : cancelled
          ? "oauth_denied"
          : "auth_callback_failed",
    );
  }

  if (!code && !(tokenHash && type)) {
    return errorRedirect(request, "invalid_link");
  }

  const supabase = await createSupabaseServerClient();
  let verifiedUser: UserWithMetadata = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return errorRedirect(request, "auth_callback_failed");
    }
    verifiedUser = data.user;
    if (data.user && isNewGoogleAccount(data.user)) {
      const read = decodeOAuthUtm(pendingOAuthUtm?.value);
      if (
        serverAnalyticsConsentAllows(
          cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value,
          read(ATTRIBUTION_FIELDS.consent),
        )
      ) {
        await captureServerEvent(
          buildUserSignedUpEvent({
            userId: data.user.id,
            read,
          }),
        );
        const identify = buildIdentifyEvent({
          userId: data.user.id,
          anonId: read(ANALYTICS_ANON_ID_FIELD),
        });
        if (identify) {
          await captureServerEvent(identify);
        }
      }
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      return errorRedirect(
        request,
        type === "recovery" ? "reset_failed" : "verification_failed",
      );
    }
    verifiedUser = data.user;
  }

  const metadataNext = signupNextFromMetadata(verifiedUser);
  const next =
    signupType && !honorReset
      ? resolveSignupNext({
          query: requestedNext,
          cookie: pendingSignupNext?.value ?? null,
          metadata: metadataNext,
          fallback,
        })
      : requestedNext === RESET_PASSWORD_PATH && honorReset
        ? RESET_PASSWORD_PATH
        : safeNext(request, fallback);

  if (metadataNext !== null) {
    try {
      await supabase.auth.updateUser({ data: { next: null } });
    } catch (cause) {
      console.error(
        "DealAtlas signup next cleanup failed",
        cause instanceof Error ? cause.name : "unknown error",
      );
    }
  }

  const url = new URL(next, request.url);
  return NextResponse.redirect(url);
}
