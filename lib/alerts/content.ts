import { FEATURE_LIMITS } from "@/lib/constants";
import { QUOTA_ERROR_COPY } from "@/lib/quotas";
import type { AlertProtectedPayload, AlertType } from "@/lib/alerts/types";

export const FREE_ALERT_COPY: Record<
  AlertType,
  { title: string; message: string }
> = {
  NEW_MATCH: {
    title: "New matching opportunity",
    message:
      "A new opportunity matches your profile or a saved search. Open it in DealAtlas, then join Pro to unlock buyer and source details.",
  },
  DEAL_CHANGED: {
    title: "Saved opportunity updated",
    message:
      "A saved opportunity changed. Open it in DealAtlas. Join Pro to unlock source details.",
  },
  DEADLINE: {
    title: "Closing window approaching",
    message:
      "A saved opportunity is entering a closing window. Join Pro to unlock exact dates.",
  },
  RENEWAL: {
    title: "Upcoming renewal window",
    message:
      "A saved opportunity has an upcoming renewal or contract-end window. Join Pro to unlock buyer identity.",
  },
};

export const SAVED_DEAL_LIMIT_COPY = QUOTA_ERROR_COPY.savedDeals;
export const SAVED_SEARCH_LIMIT_COPY = QUOTA_ERROR_COPY.savedSearches;

export const FREE_SAVED_DEAL_LIMIT = FEATURE_LIMITS.FREE.savedDeals;
export const FREE_SAVED_SEARCH_LIMIT = FEATURE_LIMITS.FREE.savedSearches;
export const PRO_SAVED_SEARCH_LIMIT = FEATURE_LIMITS.PRO.savedSearches;

export function freeAlertCopy(
  type: AlertType,
  payload: AlertProtectedPayload,
): { title: string; message: string } {
  const base = FREE_ALERT_COPY[type];
  if (!payload.previewTitle) {
    return base;
  }
  return {
    title: base.title,
    message: `${base.message} Preview: ${payload.previewTitle}.`,
  };
}

export function proAlertCopy(
  type: AlertType,
  payload: AlertProtectedPayload,
): { title: string; message: string } {
  const headline = payload.sourceTitle ?? payload.previewTitle ?? "Opportunity";
  const buyer = payload.buyerName ? ` Buyer: ${payload.buyerName}.` : "";
  const deadline = payload.exactDeadline
    ? ` Deadline: ${payload.exactDeadline}.`
    : "";
  const renewal = payload.renewalDate ? ` Renewal: ${payload.renewalDate}.` : "";
  const change = payload.changeType
    ? ` Change: ${payload.changeType.replaceAll("_", " ").toLowerCase()}.`
    : "";

  switch (type) {
    case "NEW_MATCH":
      return {
        title: `New match: ${headline}`,
        message: `A matching opportunity is ready to review.${buyer}${deadline} Open it in DealAtlas to pursue the source.`,
      };
    case "DEAL_CHANGED":
      return {
        title: `Update: ${headline}`,
        message: `A saved opportunity changed.${change}${buyer}${deadline} Open it in DealAtlas for the latest paid details.`,
      };
    case "DEADLINE":
      return {
        title: `Deadline: ${headline}`,
        message: `This opportunity is approaching its closing window.${deadline}${buyer} Open the source from DealAtlas to act.`,
      };
    case "RENEWAL":
      return {
        title: `Renewal: ${payload.buyerName ?? headline}`,
        message: `A saved opportunity has an upcoming renewal or contract-end window.${renewal}${buyer} Open DealAtlas for the evidence and source.`,
      };
  }
}
