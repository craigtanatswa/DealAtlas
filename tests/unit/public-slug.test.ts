import { describe, expect, it } from "vitest";

import {
  buildPreviewSlug,
  opaquePreviewSlugHex,
  sanitisedTitleFragment,
} from "@/lib/deals/public-slug";

describe("public preview slugs", () => {
  it("never puts an 8-digit run in a freshly allocated slug", () => {
    for (let i = 0; i < 500; i += 1) {
      const slug = buildPreviewSlug("IT services for a public organisation");
      expect(slug).not.toMatch(/\d{8}/);
      expect(slug).toMatch(/-[0-9a-f]{8}$/);
      expect(slug).not.toMatch(/-\d{8}$/);
    }
  });

  it("opaquePreviewSlugHex never returns an all-digit suffix", () => {
    for (let i = 0; i < 500; i += 1) {
      const hex = opaquePreviewSlugHex();
      expect(hex).toMatch(/^[0-9a-f]{8}$/);
      expect(hex).not.toMatch(/^\d{8}$/);
    }
  });

  it("strips CPV / notice-length digit runs from the title fragment", () => {
    expect(sanitisedTitleFragment("Framework 72000000 IT support")).toBe(
      "framework-it-support",
    );
    expect(sanitisedTitleFragment("Notice 45233100 roads")).toBe("notice-roads");
    expect(sanitisedTitleFragment("Works 1234567890 bridge")).toBe("works-bridge");
    // Shorter digit runs (years, refs) may remain; only 8+ is banned.
    expect(sanitisedTitleFragment("Works 2026 bridge")).toBe("works-2026-bridge");
    expect(buildPreviewSlug("CPV 72000000 services", "deadbeef")).toBe(
      "cpv-services-deadbeef",
    );
    expect(buildPreviewSlug("CPV 72000000 services", "deadbeef")).not.toMatch(/\d{8}/);
  });

  it("still accepts an explicit all-digit hex for legacy classification", () => {
    expect(buildPreviewSlug("Road maintenance notice", "38209406")).toBe(
      "road-maintenance-notice-38209406",
    );
  });
});
