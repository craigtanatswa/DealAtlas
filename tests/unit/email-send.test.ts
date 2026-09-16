import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isUnsafeTransactionalFrom } from "@/lib/env/production";

const ROOT = path.resolve(__dirname, "../..");

describe("transactional email fail-safes", () => {
  it("treats missing, localhost, and example.com from-addresses as unsafe", () => {
    expect(isUnsafeTransactionalFrom(undefined)).toBe(true);
    expect(isUnsafeTransactionalFrom("DealAtlas <alerts@localhost>")).toBe(true);
    expect(isUnsafeTransactionalFrom("DealAtlas <alerts@example.com>")).toBe(
      true,
    );
    expect(isUnsafeTransactionalFrom("DealAtlas <alerts@dealatlas.co.uk>")).toBe(
      false,
    );
  });

  it("skips provider sends when the from-address is unsafe", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/email/send.ts"), "utf8");
    expect(source).toContain("isUnsafeTransactionalFrom");
    expect(source).toContain("email_skipped_unsafe_from");
    expect(source).toContain("emailProviderConfigured");
    expect(source).not.toContain("alerts@localhost");
  });
});
