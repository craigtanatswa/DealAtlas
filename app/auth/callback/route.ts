import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  defaultPathForAuthType,
  sanitizeRedirectPath,
} from "@/lib/auth/redirect";
import { parseEmailOtpType } from "@/lib/auth/otp";
import { OAUTH_NEXT_COOKIE, PASSWORD_RESET_COOKIE } from "@/lib/auth/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errorRedirect(request: NextRequest, code: string) {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = `?error=${encodeURIComponent(code)}`;
  return NextResponse.redirect(url);
}

function safeNext(request: NextRequest, fallback: string) {
  return sanitizeRedirectPath(request.nextUrl.searchParams.get("next"), fallback);
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

  const signupFlow =
    type === "signup" ||
    type === "invite" ||
    type === "email" ||
    type === "email_change" ||
    type === "magiclink";
  const requestedNext = request.nextUrl.searchParams.get("next");
  const honorReset =
    type === "recovery" ||
    requestedNext === RESET_PASSWORD_PATH ||
    (Boolean(pendingReset) && !signupFlow);
  const oauthError = request.nextUrl.searchParams.get("error");
  const fallback = honorReset
    ? RESET_PASSWORD_PATH
    : pendingOAuthNext
      ? sanitizeRedirectPath(pendingOAuthNext.value)
      : defaultPathForAuthType(type);
  const next =
    requestedNext === RESET_PASSWORD_PATH && honorReset
      ? RESET_PASSWORD_PATH
      : safeNext(request, fallback);

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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return errorRedirect(request, "auth_callback_failed");
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      return errorRedirect(
        request,
        type === "recovery" ? "reset_failed" : "verification_failed",
      );
    }
  }

  const url = new URL(next, request.url);
  return NextResponse.redirect(url);
}
