export type ActionState = {
  error: string | null;
  success: string | null;
};

export const INITIAL_ACTION_STATE: ActionState = {
  error: null,
  success: null,
};

const QUERY_ERROR_MESSAGES: Record<string, string> = {
  verification_failed: "That confirmation link is invalid or has expired.",
  reset_failed: "That password reset link is invalid or has expired.",
  auth_callback_failed: "We could not complete sign-in from that link.",
  invalid_link: "That link is invalid or has expired.",
  oauth_denied: "Google sign-in was cancelled. You can try again or use email.",
};

export function messageFromAuthQueryError(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return QUERY_ERROR_MESSAGES[code] ?? null;
}

export function mapAuthError(error: { message?: string; code?: string } | null): string {
  if (!error?.message) {
    return "We could not complete that request. Please try again.";
  }

  const message = error.message.toLowerCase();
  const code = error.code?.toLowerCase() ?? "";

  if (code.includes("over_email_send_rate_limit") || message.includes("rate limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (
    message.includes("provider is not enabled") ||
    message.includes("unsupported provider")
  ) {
    return "Google sign-in is not available yet. Use email and password.";
  }
  if (message.includes("email address") && message.includes("invalid")) {
    return "Enter a valid email address.";
  }
  if (code.includes("email_address_invalid")) {
    return "Enter a valid email address.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for a verification link.";
  }
  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (message.includes("user already registered") || message.includes("already been registered")) {
    return "An account with this email already exists. Sign in or reset your password.";
  }
  if (message.includes("same_password") || message.includes("should be different from the old password")) {
    return "Choose a password you have not used before.";
  }
  if (message.includes("password")) {
    return "Password does not meet requirements. Use at least 8 characters.";
  }

  return "We could not complete that request. Please try again.";
}
