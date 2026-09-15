export type AdminLeakageRisk = "LOW" | "REVIEW" | "HIGH";

export type PreviewPublishState = {
  leakageRisk: AdminLeakageRisk;
  isPublished: boolean;
  unpublishedByAdmin: boolean;
};

export function canPublishPreview(preview: PreviewPublishState): {
  allowed: boolean;
  reason: string | null;
} {
  if (preview.unpublishedByAdmin) {
    return {
      allowed: false,
      reason: "Release the admin unpublished hold before publishing.",
    };
  }
  if (preview.leakageRisk !== "LOW") {
    return {
      allowed: false,
      reason: "Only LOW-risk previews can be published.",
    };
  }
  return { allowed: true, reason: null };
}

export function applyUnpublishHold(
  preview: PreviewPublishState,
): PreviewPublishState {
  return {
    ...preview,
    isPublished: false,
    unpublishedByAdmin: true,
  };
}

export function applyReleaseHold(
  preview: PreviewPublishState,
): PreviewPublishState {
  return {
    ...preview,
    unpublishedByAdmin: false,
    isPublished: false,
  };
}
