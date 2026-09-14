export const SEEDED_PROTECTED_MARKERS = [
  "CANARY BUYER NEVER FREE",
  "canary-protected.example",
  "CANARY-REF-987654",
  "CANARY SOURCE TITLE NEVER FREE",
  "ocds-canary-123456",
  "https://canary-source.example/notice",
  "procurement@canary-protected.example",
  "CANARY-OCID-LOOKUP",
] as const;

export const FORBIDDEN_PUBLIC_KEYS = [
  "source_url",
  "sourceUrl",
  "source_title",
  "sourceTitle",
  "application_url",
  "applicationUrl",
  "ocid",
  "reference",
  "buyer_organization_id",
  "buyerOrganizationId",
  "canonical_name",
  "canonicalName",
  "notice_identifier",
  "noticeIdentifier",
  "contact_email",
  "contactEmail",
  "email",
  "phone",
  "domain",
  "website",
] as const;

export function findProtectedMarkerLeaks(payload: string): string[] {
  return SEEDED_PROTECTED_MARKERS.filter((marker) => payload.includes(marker));
}

export function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, keys);
    }
    return keys;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      collectObjectKeys(nested, keys);
    }
  }

  return keys;
}

export function findForbiddenPublicKeys(value: unknown): string[] {
  const keys = collectObjectKeys(value);
  return FORBIDDEN_PUBLIC_KEYS.filter((key) => keys.has(key));
}
