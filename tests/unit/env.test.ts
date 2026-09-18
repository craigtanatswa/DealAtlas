import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PUBLIC_ENV_KEYS, publicEnvSchema } from "@/lib/env/public-schema";
import { SERVER_ENV_KEYS, serverEnvSchema } from "@/lib/env/server-schema";
import { getPublicEnv } from "@/lib/env/public";
import {
  liveDodoConfigErrors,
  looksLikeTestDodoApiKey,
  shouldHideDesignSystem,
} from "@/lib/env/production";
import { assertPublicEnvHasNoSecrets, pickEnv } from "@/lib/env/shared";

const ROOT = path.resolve(__dirname, "../..");

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
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com",
    });
    expect(parsed.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION).toBe("token");
    expect(parsed.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBe("G-ABC123DEF");
    expect(parsed.NEXT_PUBLIC_GOOGLE_CLIENT_ID).toBe(
      "123-abc.apps.googleusercontent.com",
    );
  });

  it("loads public env through the shared helper", () => {
    expect(getPublicEnv(validPublicEnv)).toMatchObject(validPublicEnv);
  });

  it("statically reads public process.env keys so Next can inline them for the browser", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/env/public.ts"), "utf8");
    for (const key of PUBLIC_ENV_KEYS) {
      expect(source).toContain(`process.env.${key}`);
    }
  });

  it("treats blank env values as missing", () => {
    const picked = pickEnv(
      { NEXT_PUBLIC_APP_URL: "   " },
      ["NEXT_PUBLIC_APP_URL"] as const,
    );

    expect(picked.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });
});

describe("production environment fail-safes", () => {
  it("hides the design-system catalog on hosted hostnames", () => {
    expect(shouldHideDesignSystem({ NODE_ENV: "production" })).toBe(true);
    expect(shouldHideDesignSystem({ VERCEL: "1" })).toBe(true);
    expect(shouldHideDesignSystem({ VERCEL_ENV: "preview" })).toBe(true);
    expect(shouldHideDesignSystem({ NODE_ENV: "development" }, "www.dealatlas.uk")).toBe(true);
    expect(shouldHideDesignSystem({ NODE_ENV: "development" }, "dealatlas-six.vercel.app")).toBe(true);
    expect(shouldHideDesignSystem({ NODE_ENV: "development" }, "localhost:3000")).toBe(false);
    expect(shouldHideDesignSystem({ NODE_ENV: "development" }, null)).toBe(false);
  });

  it("rejects loopback public URLs on Vercel production", () => {
    expect(() =>
      getPublicEnv({
        ...validPublicEnv,
        VERCEL_ENV: "production",
      }),
    ).toThrow(/HTTPS/);
  });

  it("accepts an HTTPS public origin on Vercel production", () => {
    expect(
      getPublicEnv({
        NEXT_PUBLIC_APP_URL: "https://www.dealatlas.example",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        VERCEL_ENV: "production",
      }).NEXT_PUBLIC_APP_URL,
    ).toBe("https://www.dealatlas.example");
  });

  it("allows missing Dodo keys in test_mode", () => {
    expect(
      liveDodoConfigErrors({
        DODO_PAYMENTS_ENVIRONMENT: "test_mode",
      }),
    ).toEqual([]);
  });

  it("rejects live_mode without live Dodo credentials", () => {
    const errors = liveDodoConfigErrors({
      DODO_PAYMENTS_ENVIRONMENT: "live_mode",
    });
    expect(errors.join("\n")).toMatch(/DODO_PAYMENTS_API_KEY/);
    expect(errors.join("\n")).toMatch(/WEBHOOK_KEY/);
    expect(errors.join("\n")).toMatch(/PRODUCT_ID/);
  });

  it("rejects live_mode when the API key looks like a test credential", () => {
    expect(looksLikeTestDodoApiKey("dodo_test_not_for_production")).toBe(true);
    expect(looksLikeTestDodoApiKey("dodo_live_prod_key")).toBe(false);
    expect(
      liveDodoConfigErrors({
        DODO_PAYMENTS_ENVIRONMENT: "live_mode",
        DODO_PAYMENTS_API_KEY: "dodo_test_not_for_production",
        DODO_PAYMENTS_WEBHOOK_KEY: "whsec_live_example_secret",
        DODO_PAYMENTS_RETURN_URL: "https://www.dealatlas.example/checkout/success",
        DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_live_monthly",
        DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_live_annual",
      }).join("\n"),
    ).toMatch(/test or placeholder/);
  });

  it("accepts complete live_mode Dodo configuration", () => {
    expect(
      liveDodoConfigErrors({
        DODO_PAYMENTS_ENVIRONMENT: "live_mode",
        DODO_PAYMENTS_API_KEY: "dodo_live_prod_key",
        DODO_PAYMENTS_WEBHOOK_KEY: "whsec_live_example_secret",
        DODO_PAYMENTS_RETURN_URL: "https://www.dealatlas.example/checkout/success",
        DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_live_monthly",
        DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_live_annual",
      }),
    ).toEqual([]);
  });

  it("applies live_mode checks when loading server env", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "lib/env/server.ts"),
      "utf8",
    );
    expect(source).toContain("liveDodoConfigErrors");
  });

  it("validates env on the Node instrumentation path, not Edge", () => {
    const entry = fs.readFileSync(
      path.join(ROOT, "instrumentation.ts"),
      "utf8",
    );
    const node = fs.readFileSync(
      path.join(ROOT, "instrumentation.node.ts"),
      "utf8",
    );
    expect(entry).toContain('NEXT_RUNTIME !== "nodejs"');
    expect(entry).toContain("instrumentation.node");
    expect(entry).toContain("onRequestError");
    expect(entry).not.toContain("process.on");
    expect(node).toContain("getServerEnv");
    expect(node).toContain("getPublicEnv");
    expect(node).toContain("process.on");
    expect(node).toContain("reportRequestError");
  });
});
