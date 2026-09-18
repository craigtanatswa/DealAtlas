import { describe, expect, it } from "vitest";

import { mapAuthError, messageFromAuthQueryError } from "@/lib/auth/messages";
import {
  googleIdTokenAuthorizeUrl,
  googleIdTokenRedirectUri,
  parseGoogleIdTokenHash,
} from "@/lib/auth/google-id-token";
import { authCallbackUrlForRequest } from "@/lib/auth/urls";

describe("Google auth messages", () => {
  it("explains a cancelled Google consent screen", () => {
    expect(messageFromAuthQueryError("oauth_denied")).toMatch(/cancelled/i);
  });

  it("does not leak provider configuration details when Google is disabled", () => {
    expect(
      mapAuthError({ message: "Unsupported provider: provider is not enabled" }),
    ).toBe("Google sign-in is not available yet. Use email and password.");
  });

  it("returns local Google OAuth users to localhost instead of production", () => {
    expect(
      authCallbackUrlForRequest("http://localhost:3000", "https://www.dealatlas.uk"),
    ).toBe("http://localhost:3000/auth/callback");
    expect(
      authCallbackUrlForRequest("https://evil.example", "https://www.dealatlas.uk"),
    ).toBe("https://www.dealatlas.uk/auth/callback");
  });

  it("sends Google’s account picker back to the DealAtlas domain, not supabase.co", () => {
    const url = googleIdTokenAuthorizeUrl({
      clientId: "123-abc.apps.googleusercontent.com",
      redirectUri: googleIdTokenRedirectUri("https://www.dealatlas.uk"),
      hashedNonce: "abc123",
      state: "state-1",
    });

    expect(googleIdTokenRedirectUri("https://www.dealatlas.uk")).toBe(
      "https://www.dealatlas.uk/auth/google",
    );
    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fwww.dealatlas.uk%2Fauth%2Fgoogle");
    expect(url).not.toContain("supabase.co");
    expect(parseGoogleIdTokenHash("#id_token=tok&state=state-1")).toEqual({
      idToken: "tok",
      state: "state-1",
    });
  });
});
