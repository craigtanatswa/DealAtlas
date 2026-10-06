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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "opportunity";
}

/** Sanitised title fragment plus 8 random hex characters. Not a deal id and not an HMAC. */
export function buildPreviewSlug(title: string, hex = randomBytes(4).toString("hex")): string {
  if (!/^[0-9a-f]{8}$/.test(hex)) {
    throw new Error("Preview slug hex must be 8 lowercase hex characters.");
  }
  return `${sanitisedTitleFragment(title)}-${hex}`;
}

/**
 * True when the slug is already this title's template fragment plus 8 random hex
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
