import { sha256Hex } from "@/ingestion/core/hash";
import { normalizeOrgName, normalizeTitle } from "@/ingestion/normalizers/text";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

export function normalizeCandidateUrl(
  value: string,
  baseUrl?: string | null,
): string | null {
  try {
    const url = new URL(value, baseUrl ?? undefined);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function domainFromCandidateUrl(value: string): string | null {
  const normalized = normalizeCandidateUrl(value);
  if (!normalized) {
    return null;
  }
  try {
    return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function dedupeKeyForCandidate(input: {
  buyerName: string | null;
  title: string | null;
  deadline: string | null;
  normalizedUrl: string;
}): string {
  const buyer = normalizeOrgName(input.buyerName ?? "");
  const title = normalizeTitle(input.title ?? "");
  const deadline = datePart(input.deadline);
  if (buyer && title) {
    return sha256Hex(`${buyer}|${title}|${deadline}`);
  }
  if (title) {
    return sha256Hex(`${title}|${deadline}`);
  }
  return sha256Hex(input.normalizedUrl);
}

export function candidatesLookLikeDuplicates(
  left: { buyerName: string | null; title: string | null; deadline: string | null },
  right: { buyerName: string | null; title: string | null; deadline: string | null },
): boolean {
  const leftKey = dedupeKeyForCandidate({ ...left, normalizedUrl: "" });
  const rightKey = dedupeKeyForCandidate({ ...right, normalizedUrl: "" });
  return leftKey === rightKey && Boolean(left.title);
}

function datePart(value: string | null): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}
