/**
 * The only preview fields a hub card or related-deal card may carry.
 * Hard rule (category ranking spec, 11 Nov 2026): never add fields here.
 */
export type PublicCardPreview = {
  slug: string;
  previewTitle: string;
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  deadlineBand: string | null;
};

export const PUBLIC_CARD_PREVIEW_COLUMNS = [
  "slug",
  "preview_title",
  "main_category",
  "broad_region",
  "value_band",
  "deadline_band",
] as const;

export const PUBLIC_CARD_PREVIEW_KEYS = [
  "slug",
  "previewTitle",
  "mainCategory",
  "broadRegion",
  "valueBand",
  "deadlineBand",
] as const;
