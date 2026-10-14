/** Mirrors the publish predicate in migration 0040. */

export const PUBLISHABLE_REUSE = ["OPEN_LICENSE", "PERMISSION_GRANTED", "UNKNOWN"] as const;

export function sourceMayPublish(source: {
  enabled: boolean;
  reuseStatus: string;
  scrapingPermitted?: boolean | null;
}): boolean {
  return (
    source.enabled &&
    source.scrapingPermitted !== false &&
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
