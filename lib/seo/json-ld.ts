import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

const FORBIDDEN_JSON_LD_KEYS = new Set([
  "buyer_name",
  "buyerName",
  "canonical_name",
  "canonicalName",
  "source_url",
  "sourceUrl",
  "source_title",
  "sourceTitle",
  "application_url",
  "applicationUrl",
  "ocid",
  "reference",
  "notice_identifier",
  "noticeIdentifier",
  "contact_email",
  "contactEmail",
  "email",
  "phone",
  "domain",
  "website",
]);

export type JsonLdRecord = Record<string, unknown>;

function assertSafeJsonLd(value: unknown, path = "jsonLd"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeJsonLd(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value as JsonLdRecord)) {
    if (FORBIDDEN_JSON_LD_KEYS.has(key)) {
      throw new Error(`JSON-LD contains protected key ${key} at ${path}`);
    }
    assertSafeJsonLd(nested, `${path}.${key}`);
  }
}

export function serializeJsonLd(data: JsonLdRecord): string {
  assertSafeJsonLd(data);
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd(origin: string): JsonLdRecord {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: origin,
    description: APP_DESCRIPTION,
    logo: `${origin}/brand/dealatlas-logo.png`,
  };
}

export function webPageJsonLd(input: {
  origin: string;
  path: string;
  name: string;
  description: string;
}): JsonLdRecord {
  const url =
    input.path === "/" ? input.origin : `${input.origin}${input.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: APP_NAME,
      url: input.origin,
    },
    publisher: {
      "@type": "Organization",
      name: APP_NAME,
      url: input.origin,
    },
  };
}

export function breadcrumbJsonLd(
  origin: string,
  crumbs: Array<{ name: string; path: string }>,
): JsonLdRecord {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item:
        crumb.path === "/" ? origin : `${origin}${crumb.path}`,
    })),
  };
}
