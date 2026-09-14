import type { Database } from "@/lib/db/database.types";

import { ComplianceError } from "@/ingestion/core/errors";

export type AccessMethod = Database["public"]["Enums"]["access_method"];
export type ReuseStatus = Database["public"]["Enums"]["reuse_status"];

export const AUTOMATABLE_REUSE_STATUSES = [
  "OPEN_LICENSE",
  "PERMISSION_GRANTED",
  "LICENSED",
  "TERMS_REVIEWED",
] as const satisfies readonly ReuseStatus[];

export const SCRAPE_ACCESS_METHODS = [
  "HTML",
  "PDF_LINK_DISCOVERY",
] as const satisfies readonly AccessMethod[];

export type SourceComplianceInput = {
  sourceKey: string;
  enabled: boolean;
  reuseStatus: ReuseStatus;
  accessMethod: AccessMethod;
  scrapingPermitted: boolean;
  licenceName?: string | null;
  licenceUrl?: string | null;
  termsUrl?: string | null;
};

export type ComplianceDecision =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

export function isScrapingAccessMethod(method: AccessMethod): boolean {
  return (SCRAPE_ACCESS_METHODS as readonly string[]).includes(method);
}

export function isAutomatableReuseStatus(status: ReuseStatus): boolean {
  return (AUTOMATABLE_REUSE_STATUSES as readonly string[]).includes(status);
}

export function canIngestSource(
  source: SourceComplianceInput,
): ComplianceDecision {
  if (!source.enabled) {
    return {
      allowed: false,
      reason: `Source ${source.sourceKey} is disabled.`,
      code: "SOURCE_DISABLED",
    };
  }

  if (source.reuseStatus === "UNKNOWN") {
    return {
      allowed: false,
      reason: `Source ${source.sourceKey} cannot be ingested while reuse status is UNKNOWN.`,
      code: "REUSE_UNKNOWN",
    };
  }

  if (source.reuseStatus === "PROHIBITED") {
    return {
      allowed: false,
      reason: `Source ${source.sourceKey} is marked PROHIBITED.`,
      code: "REUSE_PROHIBITED",
    };
  }

  if (!isAutomatableReuseStatus(source.reuseStatus)) {
    return {
      allowed: false,
      reason: `Source ${source.sourceKey} reuse status ${source.reuseStatus} does not permit production ingestion.`,
      code: "REUSE_NOT_PERMITTED",
    };
  }

  if (isScrapingAccessMethod(source.accessMethod) && !source.scrapingPermitted) {
    return {
      allowed: false,
      reason: `Source ${source.sourceKey} uses ${source.accessMethod} but scraping_permitted is false.`,
      code: "SCRAPING_NOT_PERMITTED",
    };
  }

  if (!isScrapingAccessMethod(source.accessMethod)) {
    const hasLicence =
      Boolean(source.licenceName?.trim()) || Boolean(source.licenceUrl?.trim());
    const hasTerms = Boolean(source.termsUrl?.trim());
    if (!hasLicence && !hasTerms) {
      return {
        allowed: false,
        reason: `Source ${source.sourceKey} is an official API/feed but has no licence or terms recorded.`,
        code: "LICENCE_NOT_RECORDED",
      };
    }
  }

  return { allowed: true };
}

export function assertCanIngestSource(source: SourceComplianceInput): void {
  const decision = canIngestSource(source);
  if (!decision.allowed) {
    throw new ComplianceError(decision.reason, {
      sourceKey: source.sourceKey,
      code: decision.code,
    });
  }
}

export function sourceShouldPause(
  consecutiveFailures: number,
  lastErrorCode?: string | null,
): boolean {
  if (consecutiveFailures < 8) {
    return false;
  }

  if (!lastErrorCode) {
    return true;
  }

  return (
    lastErrorCode === "HTTP_401" ||
    lastErrorCode === "HTTP_403" ||
    lastErrorCode === "HTTP_429" ||
    lastErrorCode === "ACCESS_RESTRICTED"
  );
}
