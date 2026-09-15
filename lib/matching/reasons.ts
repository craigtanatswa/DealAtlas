import {
  DETAIL_REASON_LABELS,
  MATCH_REASON_CODES,
  PREVIEW_REASON_LABELS,
  type MatchReason,
  type MatchReasonCode,
  type SanitisedMatchReason,
} from "@/lib/matching/types";

const CODE_SET = new Set<string>(MATCH_REASON_CODES);

export function isMatchReasonCode(value: string): value is MatchReasonCode {
  return CODE_SET.has(value);
}

export function sanitisedPreviewReasons(
  reasons: MatchReason[],
  options?: { limit?: number; includeMismatches?: boolean },
): SanitisedMatchReason[] {
  const limit = options?.limit ?? 3;
  const includeMismatches = options?.includeMismatches ?? false;
  const selected: SanitisedMatchReason[] = [];

  for (const reason of reasons) {
    if (reason.surface !== "preview") {
      continue;
    }
    if (reason.kind === "mismatch" && !includeMismatches && reason.code !== "NEGATIVE_KEYWORD") {
      continue;
    }
    selected.push({
      code: reason.code,
      kind: reason.kind,
      label: PREVIEW_REASON_LABELS[reason.code],
    });
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function sanitisedDetailReasons(
  reasons: MatchReason[],
  options?: { limit?: number },
): SanitisedMatchReason[] {
  const limit = options?.limit ?? 8;
  const selected: SanitisedMatchReason[] = [];
  for (const reason of reasons) {
    const label =
      reason.surface === "detail"
        ? (DETAIL_REASON_LABELS[reason.code] ?? PREVIEW_REASON_LABELS[reason.code])
        : PREVIEW_REASON_LABELS[reason.code];
    if (reason.kind !== "mismatch" && reason.surface !== "detail") {
      continue;
    }
    selected.push({
      code: reason.code,
      kind: reason.kind,
      label,
    });
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

export function parseStoredReasons(value: unknown): SanitisedMatchReason[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: SanitisedMatchReason[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.code !== "string" || !isMatchReasonCode(record.code)) {
      continue;
    }
    if (record.kind !== "match" && record.kind !== "mismatch") {
      continue;
    }
    const fallback = PREVIEW_REASON_LABELS[record.code];
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : fallback;
    parsed.push({
      code: record.code,
      kind: record.kind,
      label: label.slice(0, 180),
    });
  }
  return parsed;
}

export function reasonsToJson(reasons: SanitisedMatchReason[]): Array<{
  code: MatchReasonCode;
  kind: "match" | "mismatch";
  label: string;
}> {
  return reasons.map((reason) => ({
    code: reason.code,
    kind: reason.kind,
    label: reason.label,
  }));
}
