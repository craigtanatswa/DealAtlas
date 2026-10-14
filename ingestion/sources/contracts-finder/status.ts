import type { DealStatus } from "@/lib/search/filters";

function isFuture(value: string | null | undefined, now: Date): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime();
}

/**
 * OPEN only for a tender notice with a future submission deadline.
 * UPCOMING only for a planning notice with a dated future tender.
 * Every other release stays UNCLASSIFIED.
 */
export function mapContractsFinderDealStatus(input: {
  tags: string[];
  submissionDeadline?: string | null;
  futureTenderDate?: string | null;
  now: Date;
}): DealStatus {
  const tags = input.tags.map((tag) => tag.toLowerCase());
  if (tags.includes("tender") && isFuture(input.submissionDeadline, input.now)) {
    return "OPEN";
  }
  if (tags.includes("planning") && isFuture(input.futureTenderDate, input.now)) {
    return "UPCOMING";
  }
  return "UNCLASSIFIED";
}
