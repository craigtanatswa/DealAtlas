import { describe, expect, it } from "vitest";

import { toAlertDto, type PublishedAlertPreviews } from "@/lib/alerts/dto";
import type { AlertRecord } from "@/lib/alerts/types";
import { FREE_ENTITLEMENT } from "@/lib/entitlements/policy";
import { PLANS } from "@/lib/constants";
import { renderAlertDigest } from "@/lib/email/render";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const RECORD: AlertRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  deal_id: "22222222-2222-4222-8222-222222222222",
  alert_type: "DEADLINE",
  status: "UNREAD",
  title: "Closing window approaching",
  message: "A saved opportunity is entering a closing window.",
  protected_payload: {
    previewTitle: "Managed IT support for a public organisation",
    sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
    buyerName: "CANARY BUYER NEVER FREE",
    sourceUrl: "https://canary-source.example/notice",
    exactDeadline: "1 July 2026",
  },
  created_at: "2026-09-15T12:00:00.000Z",
  read_at: null,
  sent_at: null,
  dedupe_key: "DEADLINE:22222222-2222-4222-8222-222222222222:7",
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

const PRO: EntitlementSnapshot = {
  plan: PLANS.PRO,
  status: "ACTIVE",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingInterval: "MONTHLY",
  planKey: "PRO_MONTHLY",
};

describe("alert digest paywall", () => {
  it("keeps free digest copy free of protected source identity", () => {
    const dto = toAlertDto(RECORD, FREE_ENTITLEMENT, PUBLISHED);
    const digest = renderAlertDigest({
      plan: PLANS.FREE,
      alerts: [dto],
      appUrl: "http://localhost:3000",
    });
    const blob = `${digest.subject}\n${digest.text}\n${digest.html}`;
    expect(findProtectedMarkerLeaks(blob)).toEqual([]);
    expect(blob).toMatch(/matching opportunit/i);
    expect(blob).toContain("Join DealAtlas Pro");
    expect(blob).toContain("Managed IT support for a public organisation");
    expect(blob).not.toContain("https://canary-source.example/notice");
  });

  it("makes Pro digest actionable with paid details after entitlement mapping", () => {
    const dto = toAlertDto(RECORD, PRO, PUBLISHED);
    const digest = renderAlertDigest({
      plan: PLANS.PRO,
      alerts: [dto],
      appUrl: "http://localhost:3000",
    });
    expect(digest.text).toContain("CANARY SOURCE TITLE NEVER FREE");
    expect(digest.text).toContain("CANARY BUYER NEVER FREE");
    expect(digest.text).toContain("https://canary-source.example/notice");
    expect(digest.text).toContain("/app/deals/22222222-2222-4222-8222-222222222222");
    expect(digest.html).toContain("Open in DealAtlas");
  });

  it("never emails a free user the stored title of a held or non-LOW preview", () => {
    const leaky: AlertRecord = {
      ...RECORD,
      alert_type: "NEW_MATCH",
      protected_payload: {
        ...(RECORD.protected_payload as Record<string, unknown>),
        previewTitle: "Kelderwick depot gritting fleet for Corrivale Fenmoor",
      },
    };
    const held = toAlertDto(leaky, FREE_ENTITLEMENT, new Map());
    const digest = renderAlertDigest({ plan: PLANS.FREE, alerts: [held], appUrl: "http://localhost:3000" });
    const blob = `${digest.subject}\n${digest.text}\n${digest.html}`;
    expect(held.previewTitle).toBeUndefined();
    expect(blob).not.toContain("Kelderwick");
    expect(blob).not.toContain("Corrivale");

    const republished = toAlertDto(leaky, FREE_ENTITLEMENT, PUBLISHED);
    const current = renderAlertDigest({ plan: PLANS.FREE, alerts: [republished], appUrl: "http://localhost:3000" });
    expect(current.text).toContain("Managed IT support for a public organisation");
    expect(current.text).not.toContain("Kelderwick");
  });

  it("does not emit javascript: hrefs from scraped source URLs", () => {
    const dto = toAlertDto(
      {
        ...RECORD,
        protected_payload: {
          ...RECORD.protected_payload as Record<string, unknown>,
          sourceUrl: "javascript:alert(1)",
          applicationUrl: "javascript:alert(document.cookie)",
          sourceTitle: "<script>alert(1)</script>",
          buyerName: "<img src=x onerror=alert(1)>",
        },
      },
      PRO,
      PUBLISHED,
    );
    const digest = renderAlertDigest({
      plan: PLANS.PRO,
      alerts: [dto],
      appUrl: "http://localhost:3000",
    });

    expect(digest.html).not.toMatch(/javascript:/i);
    expect(digest.html).not.toMatch(/<script[\s>]/i);
    expect(digest.html).not.toMatch(/<img [^>]*onerror=/i);
    expect(digest.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(digest.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
