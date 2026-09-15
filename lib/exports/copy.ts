export type ExportCopyContext =
  | { source: "filters" }
  | { source: "saved" }
  | { source: "dealIds"; dealCount: number };

export const EXPORT_PAYWALL_CAPTION_SHORTLIST =
  "Exact titles, buyers, and deadlines export to a spreadsheet with DealAtlas Pro.";

export const EXPORT_PAYWALL_CAPTION_DEAL =
  "Exact title, buyer, and deadline export to a spreadsheet with DealAtlas Pro.";

function isShortlistContext(context: ExportCopyContext): boolean {
  if (context.source === "filters" || context.source === "saved") {
    return true;
  }
  return context.dealCount > 1;
}

/** Free-user CTA. Discover/saved are a shortlist; a single Deal is not. */
export function exportPaywallLabel(context: ExportCopyContext): string {
  return isShortlistContext(context) ? "Unlock this shortlist" : "Unlock export";
}

export function exportPaywallCaption(context: ExportCopyContext): string {
  return isShortlistContext(context)
    ? EXPORT_PAYWALL_CAPTION_SHORTLIST
    : EXPORT_PAYWALL_CAPTION_DEAL;
}

/** Pro download. Visible label names the file that will be produced. */
export function exportActionLabel(pending: boolean): string {
  return pending ? "Exporting…" : "Export CSV";
}

export function exportActionAriaLabel(context: ExportCopyContext): string {
  if (context.source === "dealIds" && context.dealCount === 1) {
    return "Export this opportunity as CSV";
  }
  if (context.source === "saved") {
    return "Export saved opportunities as CSV";
  }
  return "Export matching opportunities as CSV";
}

export function exportCopyContextFromProps(input: {
  source: "filters" | "saved" | "dealIds";
  dealIds?: string[];
}): ExportCopyContext {
  if (input.source === "dealIds") {
    return { source: "dealIds", dealCount: input.dealIds?.length ?? 0 };
  }
  return { source: input.source };
}
