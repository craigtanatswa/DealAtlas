import { createHash, randomBytes } from "node:crypto";

/** SHA-256 of the normalised slug. Plaintext slugs are not stored for retirement. */
export function previewSlugHash(slug: string): string {
  return createHash("sha256").update(slug.trim().toLowerCase(), "utf8").digest("hex");
}

export function sanitisedTitleFragment(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Drop CPV / notice-length digit runs so a public slug never carries
    // source-derived 8+ digit identifiers from the title.
    .replace(/\d{8,}/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "opportunity";
}

/**
 * Opaque 8-hex suffix that is never an all-digit run. Random hex can be
 * 0-9 only (~2.3% of draws), which looks like a CPV code on a public URL.
 * Callers that reconstruct legacy deal-id suffixes still pass hex explicitly.
 */
export function opaquePreviewSlugHex(): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const hex = randomBytes(4).toString("hex");
    if (!/^\d{8}$/.test(hex)) return hex;
  }
  // Astronomically unlikely; force a non-digit nibble.
  return `a${randomBytes(4).toString("hex").slice(1)}`;
}

/** Sanitised title fragment plus 8 opaque hex characters. Not a deal id and not an HMAC. */
export function buildPreviewSlug(title: string, hex = opaquePreviewSlugHex()): string {
  if (!/^[0-9a-f]{8}$/.test(hex)) {
    throw new Error("Preview slug hex must be 8 lowercase hex characters.");
  }
  return `${sanitisedTitleFragment(title)}-${hex}`;
}

/** `/deals/:slug`, excluding the sitemap index. Empty string means the segment cannot be decoded. */
export function dealPreviewPathSlug(pathname: string): string | null {
  const match = /^\/deals\/([^/]+)$/.exec(pathname);
  if (!match || match[1] === "sitemap.xml") return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

/**
 * A deal-id 8-hex suffix, or an older title slug with no 8-hex suffix.
 * The current published slug is still legacy when it has one of those shapes.
 */
export function isLegacyPublicSlug(slug: string, dealId: string): boolean {
  const hex = /-([0-9a-fA-F]{8})$/.exec(slug)?.[1]?.toLowerCase();
  if (!hex) return true;
  return hex === dealId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

export type PublishedSlugRow = {
  slug: string;
  dealId: string;
  isPublished: boolean;
  leakageRisk: string;
  unpublishedByAdmin: boolean;
};

export type DealPathGate = "next" | "gone" | "missing";

export function dealPathGate(input: {
  pathname: string;
  retired: boolean;
  match: PublishedSlugRow | null;
}): DealPathGate {
  const slug = dealPreviewPathSlug(input.pathname);
  if (slug === null) return "next";
  if (slug === "") return "missing";
  if (input.retired) return "gone";
  const row = input.match;
  if (
    row &&
    row.slug === slug &&
    row.isPublished &&
    !row.unpublishedByAdmin &&
    row.leakageRisk === "LOW" &&
    !isLegacyPublicSlug(row.slug, row.dealId)
  ) {
    return "next";
  }
  if (row && row.slug === slug && isLegacyPublicSlug(row.slug, row.dealId)) return "gone";
  return "missing";
}

/**
 * True when the slug is already this title's template fragment plus 8 opaque hex
 * characters. A suffix equal to the first 8 hex of the deal id is a PR1 slug and
 * is never kept, even when the fragment matches.
 */
export function isTemplatePreviewSlug(slug: string, title: string, dealId: string): boolean {
  const hex = /-([0-9a-fA-F]{8})$/.exec(slug)?.[1]?.toLowerCase();
  if (!hex) {
    return false;
  }
  const dealPrefix = dealId.replace(/-/g, "").slice(0, 8).toLowerCase();
  if (hex === dealPrefix) {
    return false;
  }
  return slug === buildPreviewSlug(title, hex);
}
