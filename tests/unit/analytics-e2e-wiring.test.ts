import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { configuredPostHogKey } from "@/lib/analytics/config";

describe("analytics E2E wiring", () => {
  it("runs the E2E server with a placeholder key and no upstream traffic", () => {
    const config = readFileSync("playwright.config.ts", "utf8");
    expect(config).toContain('NEXT_PUBLIC_POSTHOG_KEY: E2E_POSTHOG_KEY');
    expect(config).toContain('DEALATLAS_ANALYTICS_UPSTREAM: "off"');
    expect(configuredPostHogKey({ NEXT_PUBLIC_POSTHOG_KEY: "phc_ciplaceholder000000000000000000" })).not.toBeNull();
  });

  it("reads the key at runtime instead of a build-time inlined literal", () => {
    for (const file of ["app/layout.tsx", "app/(auth)/signup/page.tsx", "app/ingest/[...path]/route.ts", "lib/analytics/server.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("process.env.NEXT_PUBLIC_POSTHOG_KEY");
    }
  });

  it("is off without a key", () => {
    expect(configuredPostHogKey({})).toBeNull();
  });
});
