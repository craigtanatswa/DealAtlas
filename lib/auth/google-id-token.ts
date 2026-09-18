import { AUTH_GOOGLE_PATH } from "@/lib/auth/redirect";

export const GOOGLE_OAUTH_STORAGE_KEY = "da_google_oauth";

export type StoredGoogleOAuth = {
  nonce: string;
  state: string;
  next: string;
};

export function googleIdTokenRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}${AUTH_GOOGLE_PATH}`;
}

export function googleIdTokenAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  hashedNonce: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: input.hashedNonce,
    prompt: "select_account",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function parseGoogleIdTokenHash(hash: string): {
  idToken: string | null;
  state: string | null;
} {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(trimmed);
  return {
    idToken: params.get("id_token"),
    state: params.get("state"),
  };
}

export async function generateGoogleNonce(): Promise<{
  nonce: string;
  hashedNonce: string;
}> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}
