import { freeAlertCopy } from "@/lib/alerts/content";
import {
  alertDedupeKey,
  daysUntil,
  DEADLINE_WINDOWS_DAYS,
  matchingWindow,
  NEW_MATCH_MIN_SCORE,
  RENEWAL_WINDOWS_DAYS,
} from "@/lib/alerts/dedupe";
import type {
  AlertProtectedPayload,
  AlertType,
  NotificationPreferences,
} from "@/lib/alerts/types";

export type AlertDealContext = {
  dealId: string;
  previewTitle?: string;
  previewSummary?: string;
  deadlineBand?: string | null;
  valueBand?: string | null;
  category?: string | null;
  region?: string | null;
  slug?: string | null;
  sourceTitle?: string;
  buyerName?: string;
  sourceUrl?: string | null;
  applicationUrl?: string | null;
  reference?: string | null;
  exactDeadline?: string | null;
  exactValue?: string | null;
  estimatedRenewalDate?: string | null;
};

export type PlannedAlert = {
  userId: string;
  dealId: string;
  alertType: AlertType;
  dedupeKey: string;
  title: string;
  message: string;
  protectedPayload: AlertProtectedPayload;
};

export type MatchCandidate = {
  dealId: string;
  score: number;
  savedSearchId?: string;
  savedSearchName?: string;
};

export type ChangeCandidate = {
  changeId: string;
  dealId: string;
  changeType: string;
  fieldName: string | null;
};

export type DateCandidate = {
  dealId: string;
  isoDate: string;
};

function payloadFromContext(
  context: AlertDealContext | undefined,
  extra: AlertProtectedPayload = {},
): AlertProtectedPayload {
  return {
    previewTitle: context?.previewTitle,
    previewSummary: context?.previewSummary,
    deadlineBand: context?.deadlineBand,
    valueBand: context?.valueBand,
    category: context?.category,
    region: context?.region,
    slug: context?.slug,
    sourceTitle: context?.sourceTitle,
    buyerName: context?.buyerName,
    sourceUrl: context?.sourceUrl,
    applicationUrl: context?.applicationUrl,
    reference: context?.reference,
    exactDeadline: extra.exactDeadline ?? context?.exactDeadline,
    exactValue: context?.exactValue,
    renewalDate: extra.renewalDate ?? context?.estimatedRenewalDate,
    ...extra,
  };
}

function planned(
  userId: string,
  type: AlertType,
  dealId: string,
  payload: AlertProtectedPayload,
  extraKey?: string | number,
): PlannedAlert {
  const copy = freeAlertCopy(type, payload);
  return {
    userId,
    dealId,
    alertType: type,
    dedupeKey: alertDedupeKey(type, dealId, extraKey),
    title: copy.title,
    message: copy.message,
    protectedPayload: payload,
  };
}

export function planAlertsForUser(input: {
  userId: string;
  prefs: NotificationPreferences;
  matches: MatchCandidate[];
  changes: ChangeCandidate[];
  deadlines: DateCandidate[];
  renewals: DateCandidate[];
  contexts: Map<string, AlertDealContext>;
  now: Date;
}): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  const seen = new Set<string>();

  const push = (alert: PlannedAlert) => {
    if (seen.has(alert.dedupeKey)) {
      return;
    }
    seen.add(alert.dedupeKey);
    alerts.push(alert);
  };

  if (input.prefs.newMatchEnabled) {
    for (const match of input.matches) {
      if (match.score < NEW_MATCH_MIN_SCORE && !match.savedSearchId) {
        continue;
      }
      const context = input.contexts.get(match.dealId);
      push(
        planned(
          input.userId,
          "NEW_MATCH",
          match.dealId,
          payloadFromContext(context, {
            savedSearchId: match.savedSearchId,
            savedSearchName: match.savedSearchName,
          }),
        ),
      );
    }
  }

  if (input.prefs.dealChangeEnabled) {
    for (const change of input.changes) {
      const context = input.contexts.get(change.dealId);
      push(
        planned(
          input.userId,
          "DEAL_CHANGED",
          change.dealId,
          payloadFromContext(context, {
            changeType: change.changeType,
            fieldName: change.fieldName,
          }),
          change.changeId,
        ),
      );
    }
  }

  if (input.prefs.deadlineEnabled) {
    for (const deadline of input.deadlines) {
      const window = matchingWindow(
        daysUntil(deadline.isoDate, input.now),
        DEADLINE_WINDOWS_DAYS,
      );
      if (window == null) {
        continue;
      }
      const context = input.contexts.get(deadline.dealId);
      push(
        planned(
          input.userId,
          "DEADLINE",
          deadline.dealId,
          payloadFromContext(context, {
            exactDeadline: deadline.isoDate,
            windowDays: window,
          }),
          window,
        ),
      );
    }
  }

  if (input.prefs.renewalEnabled) {
    for (const renewal of input.renewals) {
      const window = matchingWindow(
        daysUntil(renewal.isoDate, input.now),
        RENEWAL_WINDOWS_DAYS,
      );
      if (window == null) {
        continue;
      }
      const context = input.contexts.get(renewal.dealId);
      push(
        planned(
          input.userId,
          "RENEWAL",
          renewal.dealId,
          payloadFromContext(context, {
            renewalDate: renewal.isoDate,
            windowDays: window,
          }),
          `${renewal.isoDate}:${window}`,
        ),
      );
    }
  }

  return alerts;
}
