import { describe, expect, it } from "vitest";

import {
  assertAlertDto,
  assertFreeAlertDto,
  toAlertCentreDto,
  toAlertDto,
  type PublishedAlertPreviews,
} from "@/lib/alerts/dto";
import { FREE_ALERT_COPY } from "@/lib/alerts/content";
import type { AlertRecord } from "@/lib/alerts/types";
import { FREE_ENTITLEMENT } from "@/lib/entitlements/policy";
import { PLANS } from "@/lib/constants";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import {
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
  SEEDED_PROTECTED_MARKERS,
} from "../helpers/protected-leak";

const CANARY_RECORD: AlertRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  deal_id: "22222222-2222-4222-8222-222222222222",
  alert_type: "NEW_MATCH",
  status: "UNREAD",
  title: "New matching opportunity",
  message: "A new opportunity matches your profile or a saved search.",
  protected_payload: {
    previewTitle: "Managed IT support for a public organisation",
    deadlineBand: "Within 7 days",
    valueBand: "£250k–£500k",
    category: "Technology",
    region: "South East England",
    sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
    buyerName: "CANARY BUYER NEVER FREE",
    sourceUrl: "https://canary-source.example/notice",
    applicationUrl: "https://canary-source.example/apply",
    reference: "CANARY-REF-987654",
    exactDeadline: "2026-07-01T12:00:00.000Z",
  },
  created_at: "2026-09-15T12:00:00.000Z",
  read_at: null,
  sent_at: null,
  dedupe_key: "NEW_MATCH:22222222-2222-4222-8222-222222222222",
};

const PUBLISHED: PublishedAlertPreviews = new Map([
  [
    "22222222-2222-4222-8222-222222222222",
    {
      previewTitle: "Managed IT support for a public organisation",
      deadlineBand: "Within 7 days",
      valueBand: "£250k–£500k",
      category: "Technology",
      region: "South East England",
    },
  ],
]);

const PRO_ENTITLEMENT: EntitlementSnapshot = {
  plan: PLANS.PRO,
  status: "ACTIVE",
  currentPeriodEnd: "2026-10-15T12:00:00.000Z",
  cancelAtPeriodEnd: false,
  billingInterval: "MONTHLY",
  planKey: "PRO_MONTHLY",
};

describe("alert DTO entitlement boundary", () => {
  it("never exposes protected_payload to free clients", () => {
    const dto = toAlertDto(CANARY_RECORD, FREE_ENTITLEMENT, PUBLISHED);
    const json = JSON.stringify(dto);

    expect(assertFreeAlertDto(dto)).toEqual(dto);
    expect(dto).not.toHaveProperty("protected_payload");
    expect(dto).not.toHaveProperty("protectedPayload");
    expect(findForbiddenPublicKeys(dto)).toEqual([]);
    expect(findProtectedMarkerLeaks(json)).toEqual([]);
    expect(dto.previewTitle).toBe("Managed IT support for a public organisation");
    expect(dto.href).toBe("/app/deals/22222222-2222-4222-8222-222222222222");
    expect(dto.title).toBe("New matching opportunity");
  });

  it("includes paid details for Pro after entitlement verification", () => {
    const dto = toAlertDto(CANARY_RECORD, PRO_ENTITLEMENT, PUBLISHED);
    expect(assertAlertDto(dto).sourceTitle).toBe("CANARY SOURCE TITLE NEVER FREE");
    expect(dto.buyerName).toBe("CANARY BUYER NEVER FREE");
    expect(dto.sourceUrl).toBe("https://canary-source.example/notice");
    expect(dto).not.toHaveProperty("protected_payload");
    expect(SEEDED_PROTECTED_MARKERS.some((marker) => dto.title.includes(marker))).toBe(
      true,
    );
  });

  it("drops preview fields from the free alert centre once the preview is held or not LOW", () => {
    const record: AlertRecord = {
      ...CANARY_RECORD,
      protected_payload: {
        ...(CANARY_RECORD.protected_payload as Record<string, unknown>),
        previewTitle: "Kelderwick depot gritting fleet for Corrivale Fenmoor",
      },
    };
    const centre = toAlertCentreDto([record], FREE_ENTITLEMENT, new Map());
    const json = JSON.stringify(centre);
    expect(centre.items[0].previewTitle).toBeUndefined();
    expect(centre.items[0].region).toBeUndefined();
    expect(json).not.toContain("Kelderwick");
    expect(json).not.toContain("Corrivale");
    expect(centre.items[0].message).toBe(FREE_ALERT_COPY.NEW_MATCH.message);
  });

  it("re-renders free alert copy from the current publishable preview, not the stored snapshot", () => {
    const record: AlertRecord = {
      ...CANARY_RECORD,
      protected_payload: {
        ...(CANARY_RECORD.protected_payload as Record<string, unknown>),
        previewTitle: "Kelderwick depot gritting fleet for Corrivale Fenmoor",
      },
    };
    const dto = toAlertDto(record, FREE_ENTITLEMENT, PUBLISHED);
    expect(dto.previewTitle).toBe("Managed IT support for a public organisation");
    expect(dto.message).toContain("Managed IT support for a public organisation");
    expect(JSON.stringify(dto)).not.toContain("Kelderwick");
  });

  it("rejects a DTO that still carries protected_payload", () => {
    expect(() =>
      assertAlertDto({
        ...toAlertDto(CANARY_RECORD, FREE_ENTITLEMENT, PUBLISHED),
        protected_payload: CANARY_RECORD.protected_payload,
      }),
    ).toThrow(/protected_payload/);
  });

  it("drops javascript: source URLs from Pro alert DTOs", () => {
    const dto = toAlertDto(
      {
        ...CANARY_RECORD,
        protected_payload: {
          ...CANARY_RECORD.protected_payload as Record<string, unknown>,
          sourceUrl: "javascript:alert(1)",
          applicationUrl: "javascript:alert(document.cookie)",
        },
      },
      PRO_ENTITLEMENT,
      PUBLISHED,
    );
    expect(dto.sourceUrl).toBeNull();
    expect(dto.applicationUrl).toBeNull();
  });
});
