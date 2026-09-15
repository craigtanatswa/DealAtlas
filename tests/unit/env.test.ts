import { describe, expect, it } from "vitest";

import { PUBLIC_ENV_KEYS, publicEnvSchema } from "@/lib/env/public-schema";
import { SERVER_ENV_KEYS, serverEnvSchema } from "@/lib/env/server-schema";
import { getPublicEnv } from "@/lib/env/public";
import { assertPublicEnvHasNoSecrets, pickEnv } from "@/lib/env/shared";

const validPublicEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

describe("environment schemas", () => {
  it("accepts valid public environment values", () => {
    expect(publicEnvSchema.parse(validPublicEnv)).toMatchObject(validPublicEnv);
  });

  it("rejects a non-URL public Supabase URL", () => {
    const result = publicEnvSchema.safeParse({
      ...validPublicEnv,
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("requires a server-only Supabase secret key", () => {
    const result = serverEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("defaults Dodo environment to test_mode", () => {
    const parsed = serverEnvSchema.parse({
      SUPABASE_SECRET_KEY: "server-secret",
    });

    expect(parsed.DODO_PAYMENTS_ENVIRONMENT).toBe("test_mode");
  });

  it("keeps public keys on NEXT_PUBLIC_ and server keys off it", () => {
    expect(
      PUBLIC_ENV_KEYS.every((key) => key.startsWith("NEXT_PUBLIC_")),
    ).toBe(true);
    expect(
      SERVER_ENV_KEYS.some((key) => key.startsWith("NEXT_PUBLIC_")),
    ).toBe(false);
  });

  it("rejects NEXT_PUBLIC secret variable names", () => {
    expect(() =>
      assertPublicEnvHasNoSecrets({
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: "leaked",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
  });

  it("accepts optional Search Console and analytics placeholders", () => {
    const parsed = publicEnvSchema.parse({
      ...validPublicEnv,
      NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "token",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC123DEF",
    });
    expect(parsed.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION).toBe("token");
    expect(parsed.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBe("G-ABC123DEF");
  });

  it("loads public env through the shared helper", () => {
    expect(getPublicEnv(validPublicEnv)).toMatchObject(validPublicEnv);
  });

  it("loads public env through the shared helper", () => {
    expect(getPublicEnv(validPublicEnv)).toMatchObject(validPublicEnv);
  });

  it("treats blank env values as missing", () => {
    const picked = pickEnv(
      { NEXT_PUBLIC_APP_URL: "   " },
      ["NEXT_PUBLIC_APP_URL"] as const,
    );

    expect(picked.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });
});
