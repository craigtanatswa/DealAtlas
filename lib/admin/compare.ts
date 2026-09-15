export type CanonicalPreviewCompareInput = {
  sourceTitle: string;
  sourceDescription: string | null;
  buyerName: string | null;
  sourceUrl: string | null;
  reference: string | null;
  ocid: string | null;
  exactValueText: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  submissionDeadline: string | null;
  exactLocationText: string | null;
  previewTitle: string;
  previewSummary: string;
  valueBand: string | null;
  deadlineBand: string | null;
  broadRegion: string | null;
  leakageRisk: string;
  isPublished: boolean;
  unpublishedByAdmin: boolean;
};

export type CanonicalPreviewCompareRow = {
  field: string;
  canonical: string;
  preview: string;
};

function display(value: string | number | boolean | null | undefined): string {
  if (value == null || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

export function compareCanonicalToPreview(
  input: CanonicalPreviewCompareInput,
): CanonicalPreviewCompareRow[] {
  return [
    {
      field: "Title",
      canonical: display(input.sourceTitle),
      preview: display(input.previewTitle),
    },
    {
      field: "Summary",
      canonical: display(input.sourceDescription),
      preview: display(input.previewSummary),
    },
    {
      field: "Buyer",
      canonical: display(input.buyerName),
      preview: "Not included in preview",
    },
    {
      field: "Source URL",
      canonical: display(input.sourceUrl),
      preview: "Not included in preview",
    },
    {
      field: "Reference / OCID",
      canonical: [input.reference, input.ocid].filter(Boolean).join(" · ") || "—",
      preview: "Not included in preview",
    },
    {
      field: "Value",
      canonical: display(
        input.exactValueText ??
          [input.valueMinExVat, input.valueMaxExVat].filter((item) => item != null).join("–"),
      ),
      preview: display(input.valueBand),
    },
    {
      field: "Deadline",
      canonical: display(input.submissionDeadline),
      preview: display(input.deadlineBand),
    },
    {
      field: "Location",
      canonical: display(input.exactLocationText),
      preview: display(input.broadRegion),
    },
    {
      field: "Publish state",
      canonical: "Canonical record is never public",
      preview: input.unpublishedByAdmin
        ? "Held unpublished by admin"
        : input.isPublished
          ? `Published (${input.leakageRisk})`
          : `Unpublished (${input.leakageRisk})`,
    },
  ];
}

export function previewContainsCanonicalMarker(
  previewText: string,
  marker: string | null | undefined,
): boolean {
  if (!marker || marker.trim().length < 4) {
    return false;
  }
  return previewText.toLowerCase().includes(marker.trim().toLowerCase());
}
