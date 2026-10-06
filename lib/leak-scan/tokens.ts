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
  if (url.length >= 12 && host && !PLATFORM_HOSTS.has(host)) {
    add("url", "SOURCE_URL", url, 12);
  }
  add("email", "EMAIL", input.buyerEmail, 8);
  return out;
}
