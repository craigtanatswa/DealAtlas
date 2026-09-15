import { appDealPath } from "@/lib/deals/paths";
import { isProEntitlement } from "@/lib/entitlements/policy";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import { freeAlertCopy, proAlertCopy } from "@/lib/alerts/content";
import {
  ALERT_DTO_KEYS,
  ALERT_TYPES,
  type AlertCentreDto,
  type AlertDto,
  type AlertProtectedPayload,
  type AlertRecord,
  type AlertType,
  FREE_ALERT_DTO_KEYS,
} from "@/lib/alerts/types";

const INTERNAL_ALERT_KEYS = [
  "protected_payload",
  "protectedPayload",
  "previous_value",
  "new_value",
  "extracted_text",
  "source_description",
  "canonical_name",
] as const;

function isAlertType(value: string): value is AlertType {
  return (ALERT_TYPES as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

export function parseProtectedPayload(value: unknown): AlertProtectedPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const windowDays =
    typeof record.windowDays === "number" && Number.isFinite(record.windowDays)
      ? Math.round(record.windowDays)
      : undefined;
  return {
    previewTitle: optionalString(record.previewTitle),
    previewSummary: optionalString(record.previewSummary),
    deadlineBand: optionalNullableString(record.deadlineBand),
    valueBand: optionalNullableString(record.valueBand),
    category: optionalNullableString(record.category),
    region: optionalNullableString(record.region),
    slug: optionalNullableString(record.slug),
    sourceTitle: optionalString(record.sourceTitle),
    buyerName: optionalString(record.buyerName),
    sourceUrl: optionalNullableString(record.sourceUrl),
    applicationUrl: optionalNullableString(record.applicationUrl),
    reference: optionalNullableString(record.reference),
    exactDeadline: optionalNullableString(record.exactDeadline),
    exactValue: optionalNullableString(record.exactValue),
    changeType: optionalNullableString(record.changeType),
    fieldName: optionalNullableString(record.fieldName),
    renewalDate: optionalNullableString(record.renewalDate),
    windowDays,
    savedSearchId: optionalString(record.savedSearchId),
    savedSearchName: optionalString(record.savedSearchName),
  };
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export function toAlertDto(
  record: AlertRecord,
  entitlement: EntitlementSnapshot,
): AlertDto {
  const type = isAlertType(record.alert_type) ? record.alert_type : "NEW_MATCH";
  const payload = parseProtectedPayload(record.protected_payload);
  const entitled = isProEntitlement(entitlement);
  const copy = entitled ? proAlertCopy(type, payload) : freeAlertCopy(type, payload);
  const href = record.deal_id ? appDealPath(record.deal_id) : "/app/alerts";

  const dto: AlertDto = {
    id: record.id,
    alertType: type,
    status: record.status,
    createdAt: record.created_at,
    readAt: record.read_at,
    title: copy.title,
    message: copy.message,
    href,
    dealId: record.deal_id,
    previewTitle: payload.previewTitle,
    deadlineBand: payload.deadlineBand,
    valueBand: payload.valueBand,
    category: payload.category,
    region: payload.region,
    windowDays: payload.windowDays,
    savedSearchName: payload.savedSearchName,
  };

  if (entitled) {
    dto.sourceTitle = payload.sourceTitle;
    dto.buyerName = payload.buyerName;
    dto.sourceUrl = payload.sourceUrl;
    dto.applicationUrl = payload.applicationUrl;
    dto.reference = payload.reference;
    dto.exactDeadline = payload.exactDeadline;
    dto.exactValue = payload.exactValue;
    dto.changeType = payload.changeType;
    dto.renewalDate = payload.renewalDate;
  }

  return compact(dto);
}

export function toAlertCentreDto(
  records: AlertRecord[],
  entitlement: EntitlementSnapshot,
): AlertCentreDto {
  const items = records.map((record) => toAlertDto(record, entitlement));
  return {
    plan: entitlement.plan,
    unreadCount: records.filter((record) => record.status === "UNREAD").length,
    items,
  };
}

export function assertAlertDto(value: unknown): AlertDto {
  if (!value || typeof value !== "object") {
    throw new Error("Alert DTO must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const key of INTERNAL_ALERT_KEYS) {
    if (key in record) {
      throw new Error(`Alert DTO contains internal key ${key}`);
    }
  }
  if ("protected_payload" in record || "protectedPayload" in record) {
    throw new Error("Alert DTO must not expose protected_payload");
  }
  for (const key of Object.keys(record)) {
    if (!(ALERT_DTO_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Alert DTO contains unexpected key ${key}`);
    }
  }
  return value as AlertDto;
}

export function assertFreeAlertDto(value: unknown): AlertDto {
  const dto = assertAlertDto(value);
  for (const key of Object.keys(dto)) {
    if (!(FREE_ALERT_DTO_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Free alert DTO contains paid key ${key}`);
    }
  }
  return dto;
}
