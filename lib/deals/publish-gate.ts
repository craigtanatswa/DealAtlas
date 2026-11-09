/** Mirrors the publish predicate in migration 0040. */

export const PUBLISHABLE_REUSE = ["OPEN_LICENSE", "PERMISSION_GRANTED", "UNKNOWN"] as const;

/** Statuses considered by the explicit republish-open-deals operator job. */
export const REPUBLISH_OPEN_STATUSES = [
  "OPEN",
  "ACTIVE",
  "CLOSING_SOON",
  "UPCOMING",
] as const;

export function sourceMayPublish(source: { enabled: boolean; reuseStatus: string }): boolean {
  return (
    source.enabled &&
    (PUBLISHABLE_REUSE as readonly string[]).includes(source.reuseStatus) &&
    source.reuseStatus !== "PROHIBITED"
  );
}

export function stageMayPublish(status: string, stage: string): boolean {
  if ((status === "OPEN" || status === "CLOSING_SOON") && stage === "LIVE") {
    return true;
  }
  return status === "UPCOMING" && stage === "PLANNING";
}

/** First publication. A null deadline is allowed. A past deadline is not. */
export function deadlineMayPublish(
  status: string,
  deadline: Date | null,
  now: Date,
): boolean {
  if (!stageMayPublish(status, status === "UPCOMING" ? "PLANNING" : "LIVE")) {
    return false;
  }
  if (deadline == null) {
    return true;
  }
  if (deadline.getTime() <= now.getTime()) {
    return false;
  }
  if (status === "UPCOMING") {
    return true;
  }
  return deadline.getTime() > now.getTime() + 24 * 60 * 60 * 1000;
}

export const DISCOVERY_AUTO_PUBLISH_MIN_CONFIDENCE = 90;

export type DiscoveryCandidateGateInput = {
  status: string;
  opportunityType: string | null;
  confidence: number;
};

export type DiscoverySourceGateInput = {
  enabled: boolean;
  reuseStatus: string;
  scrapingPermitted?: boolean;
  autoPublish: boolean;
  autoPublishMinConfidence: number;
};

export function candidateApprovedForPublish(
  candidate: DiscoveryCandidateGateInput,
): { allowed: boolean; reason: string | null } {
  if (candidate.status !== "APPROVED") {
    return { allowed: false, reason: "Only APPROVED discovery candidates may publish." };
  }
  if (candidate.opportunityType === "SUPPLIER_ONBOARDING") {
    return {
      allowed: false,
      reason: "Supplier onboarding candidates are never publishable.",
    };
  }
  return { allowed: true, reason: null };
}

export function autoPublishMayPublish(input: {
  candidate: DiscoveryCandidateGateInput;
  source: DiscoverySourceGateInput;
}): { allowed: boolean; reason: string | null } {
  const approved = candidateApprovedForPublish(input.candidate);
  if (!approved.allowed) {
    return approved;
  }
  if (!input.source.enabled) {
    return { allowed: false, reason: "The source is disabled." };
  }
  if (input.source.reuseStatus === "UNKNOWN" || input.source.reuseStatus === "PROHIBITED") {
    return {
      allowed: false,
      reason: `The source reuse status ${input.source.reuseStatus} blocks publication.`,
    };
  }
  if (!input.source.autoPublish) {
    return { allowed: false, reason: "Auto-publish is disabled for this source." };
  }
  const threshold = Math.max(
    DISCOVERY_AUTO_PUBLISH_MIN_CONFIDENCE,
    input.source.autoPublishMinConfidence,
  );
  if (input.candidate.confidence < threshold) {
    return {
      allowed: false,
      reason: `Candidate confidence ${input.candidate.confidence} is below the ${threshold} threshold.`,
    };
  }
  return { allowed: true, reason: null };
}
