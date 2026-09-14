import { describe, expect, it } from "vitest";

import { PUBLIC_PREVIEW_DTO_KEYS, toPublicDealPreview } from "@/lib/search/dto";
import { publicDealPreviewMetadata } from "@/lib/search/metadata";
import type { DealPreviewPublic } from "@/lib/db/previews";
import {
  FORBIDDEN_PUBLIC_KEYS,
  SEEDED_PROTECTED_MARKERS,
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
} from "../helpers/protected-leak";

const sanitisedRow = {
  deal_id: "22222222-2222-4222-8222-222222222222",
  slug: "managed-it-support-preview",
  preview_title: "Managed IT support for a public organisation",
  preview_summary:
    "A public organisation needs ongoing technology support without exposing source identity.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "Technology",
  broad_region: "South East England",
  value_band: "£250k–£500k",
  deadline_band: "Within 3 weeks",
  duration_band: "3–5 years",
  sme_suitability: "HIGH",
  bid_complexity: "MEDIUM",
  competition_level: "LOW",
  requirements_preview: [
    "relevant implementation experience",
    "security/data-protection capability",
  ],
  relevance_tags: ["it-support"],
  freshness_label: "Recently added",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
} as DealPreviewPublic;

describe("public preview DTO", () => {
  it("maps only sanitised preview fields", () => {
    const dto = toPublicDealPreview(sanitisedRow);
    const json = JSON.stringify(dto);

    expect(Object.keys(dto).sort()).toEqual([...PUBLIC_PREVIEW_DTO_KEYS].sort());
    expect(findForbiddenPublicKeys(dto)).toEqual([]);
    expect(findProtectedMarkerLeaks(json)).toEqual([]);
    expect(json).not.toContain(sanitisedRow.deal_id);
    expect(json).not.toContain("created_at");
    expect(json).not.toContain("updated_at");
  });

  it("does not copy extra protected properties from a poisoned row", () => {
    const poisoned = {
      ...sanitisedRow,
      source_title: "CANARY SOURCE TITLE NEVER FREE",
      source_url: "https://canary-source.example/notice",
      ocid: "ocds-canary-123456",
      canonical_name: "CANARY BUYER NEVER FREE",
    };
    const dto = toPublicDealPreview(poisoned);
    const json = JSON.stringify(dto);

    expect(findForbiddenPublicKeys(dto)).toEqual([]);
    expect(findProtectedMarkerLeaks(json)).toEqual([]);
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      expect(key in dto).toBe(false);
    }
  });

  it("builds SEO metadata from preview fields only", () => {
    const dto = toPublicDealPreview(sanitisedRow);
    const metadata = publicDealPreviewMetadata(
      dto,
      "http://localhost:3000/deals/managed-it-support-preview",
    );
    const serialized = JSON.stringify(metadata);

    expect(serialized).toContain(dto.previewTitle);
    expect(serialized).toContain(dto.previewSummary.slice(0, 40));
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(findForbiddenPublicKeys(metadata)).toEqual([]);
  });

  it("knows the seeded canary markers used by leak tests", () => {
    expect(SEEDED_PROTECTED_MARKERS.length).toBeGreaterThan(3);
  });
});
