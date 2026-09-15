import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";
import type { SanitisedMatchReason } from "@/lib/matching/types";

const FORBIDDEN_REASON_PATTERNS = [
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /@/,
  /\bocds-/i,
  /\bfind a tender\b/i,
  /\bcontracts finder\b/i,
];

export function dropLeakingReasons(
  reasons: SanitisedMatchReason[],
  leakInput?: LeakScanInput | null,
): SanitisedMatchReason[] {
  const forbiddenTokens = [
    leakInput?.sourceTitle,
    leakInput?.sourceDescription,
    leakInput?.ocid,
    leakInput?.reference,
    leakInput?.externalPrimaryId,
    leakInput?.sourceUrl,
    leakInput?.applicationUrl,
    leakInput?.sourceName,
    leakInput?.buyerName,
    leakInput?.buyerDomain,
    leakInput?.buyerEmail,
    leakInput?.buyerPhone,
    leakInput?.exactValueText,
    leakInput?.exactLocationText,
    ...(leakInput?.buyerAliases ?? []),
  ]
    .filter((item): item is string => Boolean(item && item.trim().length >= 4))
    .map((item) => item.toLowerCase());

  return reasons.filter((reason) => {
    const label = reason.label.trim();
    if (!label || label.length > 180) {
      return false;
    }
    if (FORBIDDEN_REASON_PATTERNS.some((pattern) => pattern.test(label))) {
      return false;
    }
    const lowered = label.toLowerCase();
    if (forbiddenTokens.some((token) => lowered.includes(token))) {
      return false;
    }
    if (!leakInput) {
      return true;
    }
    const scan = scanPreviewLeaks({
      ...leakInput,
      previewTitle: "Match reason",
      previewSummary: label,
      requirementsPreview: [],
      relevanceTags: [],
    });
    return scan.risk === "LOW";
  });
}
