import { describe, expect, it } from "vitest";

import {
  alertDedupeKey,
  daysUntil,
  matchingWindow,
  shouldEvaluateSavedSearch,
} from "@/lib/alerts/dedupe";
import { planAlertsForUser, type AlertDealContext } from "@/lib/alerts/plan";
import type { NotificationPreferences } from "@/lib/alerts/types";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const NOW = new Date("2026-09-15T12:00:00.000Z");

const PREFS: NotificationPreferences = {
  emailEnabled: true,
  newMatchEnabled: true,
  dealChangeEnabled: true,
  deadlineEnabled: true,
  renewalEnabled: true,
  digestCadence: "DAILY",
  lastDigestSentAt: null,
};

const CONTEXT: AlertDealContext = {
  dealId: "22222222-2222-4222-8222-222222222222",
  previewTitle: "Managed IT support for a public organisation",
  sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
  buyerName: "CANARY BUYER NEVER FREE",
  sourceUrl: "https://canary-source.example/notice",
  exactDeadline: "2026-09-18T12:00:00.000Z",
};

describe("alert planning and dedupe", () => {
  it("stores free-safe title/message even when protected payload is present", () => {
    const alerts = planAlertsForUser({
      userId: "user-1",
      prefs: PREFS,
      matches: [{ dealId: CONTEXT.dealId, score: 88 }],
      changes: [],
      deadlines: [],
      renewals: [],
      contexts: new Map([[CONTEXT.dealId, CONTEXT]]),
      now: NOW,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.dedupeKey).toBe(alertDedupeKey("NEW_MATCH", CONTEXT.dealId));
    expect(findProtectedMarkerLeaks(alerts[0]?.title ?? "")).toEqual([]);
    expect(findProtectedMarkerLeaks(alerts[0]?.message ?? "")).toEqual([]);
    expect(alerts[0]?.protectedPayload.sourceTitle).toBe(
      "CANARY SOURCE TITLE NEVER FREE",
    );
  });

  it("does not emit duplicate new-match alerts for the same deal", () => {
    const alerts = planAlertsForUser({
      userId: "user-1",
      prefs: PREFS,
      matches: [
        { dealId: CONTEXT.dealId, score: 88 },
        { dealId: CONTEXT.dealId, score: 100, savedSearchId: "search-1" },
      ],
      changes: [],
      deadlines: [],
      renewals: [],
      contexts: new Map([[CONTEXT.dealId, CONTEXT]]),
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
  });

  it("emits deadline and renewal windows once per window", () => {
    const alerts = planAlertsForUser({
      userId: "user-1",
      prefs: PREFS,
      matches: [],
      changes: [],
      deadlines: [{ dealId: CONTEXT.dealId, isoDate: "2026-09-18T12:00:00.000Z" }],
      renewals: [{ dealId: CONTEXT.dealId, isoDate: "2026-10-20T00:00:00.000Z" }],
      contexts: new Map([[CONTEXT.dealId, CONTEXT]]),
      now: NOW,
    });
    expect(alerts.map((alert) => alert.alertType).sort()).toEqual([
      "DEADLINE",
      "RENEWAL",
    ]);
    expect(matchingWindow(daysUntil("2026-09-18T12:00:00.000Z", NOW), [1, 3, 7])).toBe(
      3,
    );
  });

  it("skips disabled saved-search evaluation", () => {
    expect(
      shouldEvaluateSavedSearch(
        { enabled: false, alertCadence: "DAILY", lastEvaluatedAt: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldEvaluateSavedSearch(
        {
          enabled: true,
          alertCadence: "WEEKLY",
          lastEvaluatedAt: "2026-09-14T12:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(false);
  });
});
