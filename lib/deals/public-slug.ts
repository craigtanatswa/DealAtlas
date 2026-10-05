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
