import type { Plan } from "@/lib/constants";

export const ALERT_TYPES = [
  "NEW_MATCH",
  "DEAL_CHANGED",
  "DEADLINE",
  "RENEWAL",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_STATUSES = ["UNREAD", "READ", "SENT", "DISMISSED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const DIGEST_CADENCES = ["IMMEDIATE", "DAILY", "WEEKLY"] as const;
export type DigestCadence = (typeof DIGEST_CADENCES)[number];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  NEW_MATCH: "New match",
  DEAL_CHANGED: "Deal updated",
  DEADLINE: "Closing window",
  RENEWAL: "Renewal window",
};

export type AlertProtectedPayload = {
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
  changeType?: string | null;
  fieldName?: string | null;
  renewalDate?: string | null;
  windowDays?: number;
  savedSearchId?: string;
  savedSearchName?: string;
};

export type AlertRecord = {
  id: string;
  user_id: string;
  deal_id: string | null;
  alert_type: AlertType;
  status: AlertStatus;
  title: string;
  message: string;
  protected_payload: unknown;
  created_at: string;
  read_at: string | null;
  sent_at: string | null;
  dedupe_key: string;
};

export type AlertSafeFields = {
  previewTitle?: string;
  deadlineBand?: string | null;
  valueBand?: string | null;
  category?: string | null;
  region?: string | null;
};

export type AlertProFields = {
  sourceTitle?: string;
  buyerName?: string;
  sourceUrl?: string | null;
  applicationUrl?: string | null;
  reference?: string | null;
  exactDeadline?: string | null;
  exactValue?: string | null;
  changeType?: string | null;
  renewalDate?: string | null;
};

export type AlertDto = AlertSafeFields & {
  id: string;
  alertType: AlertType;
  status: AlertStatus;
  createdAt: string;
  readAt: string | null;
  title: string;
  message: string;
  href: string;
  dealId: string | null;
  windowDays?: number;
  savedSearchName?: string;
} & Partial<AlertProFields>;

export const ALERT_DTO_KEYS = [
  "id",
  "alertType",
  "status",
  "createdAt",
  "readAt",
  "title",
  "message",
  "href",
  "dealId",
  "previewTitle",
  "deadlineBand",
  "valueBand",
  "category",
  "region",
  "windowDays",
  "savedSearchName",
  "sourceTitle",
  "buyerName",
  "sourceUrl",
  "applicationUrl",
  "reference",
  "exactDeadline",
  "exactValue",
  "changeType",
  "renewalDate",
] as const;

export const FREE_ALERT_DTO_KEYS = [
  "id",
  "alertType",
  "status",
  "createdAt",
  "readAt",
  "title",
  "message",
  "href",
  "dealId",
  "previewTitle",
  "deadlineBand",
  "valueBand",
  "category",
  "region",
  "windowDays",
  "savedSearchName",
] as const;

export type AlertCentreDto = {
  plan: Plan;
  unreadCount: number;
  items: AlertDto[];
};

export type NotificationPreferences = {
  emailEnabled: boolean;
  newMatchEnabled: boolean;
  dealChangeEnabled: boolean;
  deadlineEnabled: boolean;
  renewalEnabled: boolean;
  digestCadence: DigestCadence;
  lastDigestSentAt: string | null;
};
