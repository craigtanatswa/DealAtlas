"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FormStatus } from "@/components/auth/form-status";
import {
  GOOGLE_OAUTH_STORAGE_KEY,
  parseGoogleIdTokenHash,
  type StoredGoogleOAuth,
} from "@/lib/auth/google-id-token";
import { LOGIN_PATH, sanitizeRedirectPath } from "@/lib/auth/redirect";
import { mapAuthError } from "@/lib/auth/messages";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function readStoredOAuth(): StoredGoogleOAuth | null {
  const raw = sessionStorage.getItem(GOOGLE_OAUTH_STORAGE_KEY);
  sessionStorage.removeItem(GOOGLE_OAUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredGoogleOAuth;
    if (
      typeof parsed.nonce === "string" &&
      typeof parsed.state === "string" &&
      typeof parsed.next === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function GoogleAuthReturn() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      router.replace(`${LOGIN_PATH}?error=oauth_denied`);
      return;
    }

    const { idToken, state } = parseGoogleIdTokenHash(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);

    const stored = readStoredOAuth();
    if (!idToken || !stored || stored.state !== state) {
      router.replace(`${LOGIN_PATH}?error=auth_callback_failed`);
      return;
    }

    const next = sanitizeRedirectPath(stored.next);
    const supabase = createSupabaseBrowserClient();

    void supabase.auth
      .signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: stored.nonce,
      })
      .then(({ error: signInError }) => {
        if (signInError) {
          setError(mapAuthError(signInError));
          return;
        }
        router.replace(next);
        router.refresh();
      });
  }, [router]);

  if (error) {
    return <FormStatus error={error} />;
  }

  return <p className="text-sm text-muted-foreground">Completing Google sign-in…</p>;
}
