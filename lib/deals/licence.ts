import type { Database } from "@/lib/db/database.types";

export type ReuseStatus = Database["public"]["Enums"]["reuse_status"];

/**
 * How DealAtlas may present source-bearing content to an entitled Pro user.
 * Linking is preferred when redistribution of verbatim notice text is not clearly permitted.
 */
export type SourceContentAccess = "redistribute" | "link" | "withhold";

export const REDISTRIBUTABLE_REUSE_STATUSES = [
  "OPEN_LICENSE",
  "PERMISSION_GRANTED",
  "LICENSED",
] as const satisfies readonly ReuseStatus[];

export function isReuseStatus(value: unknown): value is ReuseStatus {
  return (
    value === "OPEN_LICENSE" ||
    value === "PERMISSION_GRANTED" ||
    value === "LICENSED" ||
    value === "TERMS_REVIEWED" ||
    value === "UNKNOWN" ||
    value === "PROHIBITED"
  );
}

export function sourceContentAccess(
  reuseStatus: unknown,
): SourceContentAccess {
  if (reuseStatus === "PROHIBITED") {
    return "withhold";
  }

  if (
    typeof reuseStatus === "string" &&
    (REDISTRIBUTABLE_REUSE_STATUSES as readonly string[]).includes(reuseStatus)
  ) {
    return "redistribute";
  }

  return "link";
}

export function canRedistributeVerbatim(access: SourceContentAccess): boolean {
  return access === "redistribute";
}

export function canShowNoticeMetadata(access: SourceContentAccess): boolean {
  return access !== "withhold";
}

export function canLinkToSource(access: SourceContentAccess): boolean {
  return access !== "withhold";
}

export function provenanceSummary(access: SourceContentAccess): string {
  if (access === "redistribute") {
    return "Source licence terms allow DealAtlas to display notice content here. Original documents still open on the source site.";
  }
  if (access === "withhold") {
    return "Source licence or terms do not allow DealAtlas to display this notice. Open the original source if a link is available.";
  }
  return "DealAtlas links to the original notice rather than redistributing verbatim source text. Open the source for the official description and documents.";
}

export function reuseStatusLabel(status: ReuseStatus | null): string {
  if (!status) {
    return "Not recorded";
  }

  switch (status) {
    case "OPEN_LICENSE":
      return "Open licence";
    case "PERMISSION_GRANTED":
      return "Permission granted";
    case "LICENSED":
      return "Licensed feed";
    case "TERMS_REVIEWED":
      return "Terms reviewed — link to source";
    case "UNKNOWN":
      return "Reuse status unknown — link to source";
    case "PROHIBITED":
      return "Redistribution prohibited";
    default:
      return "Not recorded";
  }
}
