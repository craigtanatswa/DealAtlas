import { describe, expect, it } from "vitest";

import { previewRegenerationBlockReason } from "@/lib/jobs/preview-regeneration-guard";

describe("preview regeneration guard", () => {
  it("allows a local database and refuses production", () => {
    expect(
      previewRegenerationBlockReason({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toBeNull();
    expect(
      previewRegenerationBlockReason({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
        DEALATLAS_PROD_SUPABASE_PROJECT_REF: "abcdefgh",
      }),
    ).toMatch(/production/);
    expect(
      previewRegenerationBlockReason({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        VERCEL_ENV: "production",
      }),
    ).toMatch(/production/);
    expect(
      previewRegenerationBlockReason({
        NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
      }),
    ).toMatch(/non-local/);
  });
});
