import { describe, expect, it } from "vitest";

import {
  applyReleaseHold,
  applyUnpublishHold,
  canPublishPreview,
} from "@/lib/admin/preview-policy";

describe("admin preview publish hold", () => {
  it("lets an admin keep a LOW-risk preview unpublished", () => {
    const held = applyUnpublishHold({
      leakageRisk: "LOW",
      isPublished: true,
      unpublishedByAdmin: false,
    });
    expect(held).toEqual({
      leakageRisk: "LOW",
      isPublished: false,
      unpublishedByAdmin: true,
    });
    expect(canPublishPreview(held).allowed).toBe(false);
  });

  it("refuses to publish REVIEW or HIGH previews", () => {
    expect(
      canPublishPreview({
        leakageRisk: "REVIEW",
        isPublished: false,
        unpublishedByAdmin: false,
      }).allowed,
    ).toBe(false);
    expect(
      canPublishPreview({
        leakageRisk: "HIGH",
        isPublished: false,
        unpublishedByAdmin: false,
      }).allowed,
    ).toBe(false);
  });

  it("allows publishing only after the hold is released and risk is LOW", () => {
    const released = applyReleaseHold({
      leakageRisk: "LOW",
      isPublished: false,
      unpublishedByAdmin: true,
    });
    expect(released.unpublishedByAdmin).toBe(false);
    expect(released.isPublished).toBe(false);
    expect(canPublishPreview(released).allowed).toBe(true);
  });
});
