import type { ManifestToken } from "@/tests/leak/lib/scan";

const PLATFORM_HOSTS = new Set([
  "www.contractsfinder.service.gov.uk",
  "www.find-tender.service.gov.uk",
  "www.publiccontractsscotland.gov.uk",
  "www.sell2wales.gov.wales",
]);

function token(id: string, tokenClass: string, value: string, dealId: string): ManifestToken {
  return {
    id,
    class: tokenClass,
    canonical: value,
    variants: [value],
    regex: [],
    match: { boundary: "word", squash: value.length >= 8 },
    rows: [dealId],
    search_queries: [],
    control: "qxjzvbnm",
  };
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

const GENERIC_NAME_WORDS = new Set([
  "the", "and", "for", "with", "from", "council", "authority", "government", "department",
  "services", "service", "limited", "company", "group", "public", "organisation",
  "organization", "borough", "district", "county", "ministry", "office", "trust", "board",
]);

export function isGenericName(value: string): boolean {
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.length === 0 || words.every((word) => word.length < 4 || GENERIC_NAME_WORDS.has(word));
}

const STRONG_CLASSES = new Set(["BUYER_NAME", "OCID", "REFERENCE", "SOURCE_URL", "SOURCE_DOMAIN", "PORTAL_NAME"]);

/** Buyer names, notice ids, source URLs/domains and portal names. Titles and short generic words stay out. */
export function isStrongSourceToken(entry: ManifestToken): boolean {
  if (!STRONG_CLASSES.has(entry.class)) return false;
  if (entry.class === "BUYER_NAME" || entry.class === "PORTAL_NAME") return !isGenericName(entry.canonical);
  return true;
}

export function unionStrongTokens(sets: Array<{ tokens: ManifestToken[] }>): ManifestToken[] {
  const seen = new Set<string>();
  const out: ManifestToken[] = [];
  for (const set of sets) {
    for (const entry of set.tokens) {
      if (!isStrongSourceToken(entry)) continue;
      const key = `${entry.class}:${entry.canonical.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...entry, id: `union-${out.length}` });
    }
  }
  return out;
}

/** Source identifiers compiled later by the harness token rules. Values stay out of logs. */
export function sourceManifestTokens(input: {
  dealId: string;
  sourceTitle: string;
  buyerName: string | null;
  ocid: string | null;
  reference: string | null;
  externalPrimaryId: string | null;
  sourceUrl: string | null;
  buyerEmail: string | null;
  sourceName?: string | null;
}): ManifestToken[] {
  const out: ManifestToken[] = [];
  const add = (field: string, tokenClass: string, value: string | null, min: number) => {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length < min) return;
    out.push(token(field, tokenClass, trimmed, input.dealId));
  };
  add("title", "SOURCE_TITLE", input.sourceTitle, 12);
  add("buyer", "BUYER_NAME", input.buyerName, 8);
  add("ocid", "OCID", input.ocid, 8);
  add("reference", "REFERENCE", input.reference, 6);
  add("external", "REFERENCE", input.externalPrimaryId, 8);
  const url = input.sourceUrl?.trim() ?? "";
  const host = url ? hostOf(url) : null;
  if (url.length >= 12 && host && !host.endsWith("dealatlas.uk") && !PLATFORM_HOSTS.has(host)) {
    add("url", "SOURCE_URL", url, 12);
  }
  if (host && host.length >= 8 && !host.endsWith("dealatlas.uk")) {
    add("domain", "SOURCE_DOMAIN", host, 8);
  }
  add("email", "EMAIL", input.buyerEmail, 8);
  add("portal", "PORTAL_NAME", input.sourceName ?? null, 8);
  return out;
}
