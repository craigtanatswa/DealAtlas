"use server";

import { revalidatePath } from "next/cache";

import { requireAdminAction } from "@/lib/admin/access";
import { AdminAccessError, AdminMutationError } from "@/lib/admin/errors";
import {
  holdPreviewUnpublished,
  mergeOrganizations,
  publishPreviewIfLow,
  regenerateDealPreview,
  releasePreviewHold,
  reprocessRawRecord,
  retryDocumentJob,
  retryMatchJob,
  runManualSourceIngestion,
  setSourceEnabled,
  updateDealQuality,
} from "@/lib/admin/mutations";
import { parseAdminIdParam } from "@/lib/admin/paths";
import type { ActionState } from "@/lib/auth/messages";
import { ValidationError } from "@/lib/validation";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formFlag(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function revalidateAdmin(paths: string[] = []) {
  revalidatePath("/admin");
  for (const path of paths) {
    revalidatePath(path);
  }
}

function actionError(error: unknown): ActionState {
  if (error instanceof AdminAccessError) {
    return { error: error.message, success: null };
  }
  if (error instanceof AdminMutationError) {
    return { error: error.message, success: null };
  }
  if (error instanceof ValidationError) {
    return { error: "That admin request was not valid.", success: null };
  }
  return { error: "The admin action could not be completed.", success: null };
}

async function withAdminAction(
  run: (actorId: string) => Promise<ActionState>,
): Promise<ActionState> {
  try {
    const account = await requireAdminAction("/admin");
    return await run(account.user.id);
  } catch (error) {
    return actionError(error);
  }
}

export async function setSourceEnabledAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const sourceId = parseAdminIdParam(formString(formData, "sourceId"));
    if (!sourceId) {
      return { error: "That source could not be updated.", success: null };
    }
    await setSourceEnabled({
      actorId,
      sourceId,
      enabled: formFlag(formData, "enabled"),
    });
    revalidateAdmin([`/admin/sources/${sourceId}`, "/admin/sources"]);
    return {
      error: null,
      success: formFlag(formData, "enabled")
        ? "Source enabled."
        : "Source disabled.",
    };
  });
}

export async function holdPreviewUnpublishedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const dealId = parseAdminIdParam(formString(formData, "dealId"));
    if (!dealId) {
      return { error: "That preview could not be held.", success: null };
    }
    await holdPreviewUnpublished({ actorId, dealId });
    revalidateAdmin([`/admin/deals/${dealId}`, "/admin/deals", "/admin/data-quality"]);
    return { error: null, success: "Preview will stay unpublished." };
  });
}

export async function releasePreviewHoldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const dealId = parseAdminIdParam(formString(formData, "dealId"));
    if (!dealId) {
      return { error: "That preview hold could not be released.", success: null };
    }
    await releasePreviewHold({ actorId, dealId });
    revalidateAdmin([`/admin/deals/${dealId}`, "/admin/deals", "/admin/data-quality"]);
    return { error: null, success: "Unpublished hold released. Preview stays unpublished until published." };
  });
}

export async function publishPreviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const dealId = parseAdminIdParam(formString(formData, "dealId"));
    if (!dealId) {
      return { error: "That preview could not be published.", success: null };
    }
    await publishPreviewIfLow({ actorId, dealId });
    revalidateAdmin([`/admin/deals/${dealId}`, "/admin/deals"]);
    return { error: null, success: "Published the LOW-risk preview." };
  });
}

export async function regeneratePreviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const dealId = parseAdminIdParam(formString(formData, "dealId"));
    if (!dealId) {
      return { error: "That preview could not be regenerated.", success: null };
    }
    const result = await regenerateDealPreview({ actorId, dealId });
    revalidateAdmin([`/admin/deals/${dealId}`, "/admin/deals", "/admin/data-quality"]);
    return {
      error: null,
      success: result.published
        ? `Regenerated and published (${result.leakageRisk}).`
        : `Regenerated and left unpublished (${result.leakageRisk}).`,
    };
  });
}

export async function updateDealQualityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const dealId = parseAdminIdParam(formString(formData, "dealId"));
    const score = Number(formString(formData, "dataQualityScore"));
    if (!dealId || !Number.isInteger(score) || score < 0 || score > 100) {
      return { error: "Enter a data quality score between 0 and 100.", success: null };
    }
    await updateDealQuality({ actorId, dealId, dataQualityScore: score });
    revalidateAdmin([`/admin/deals/${dealId}`, "/admin/deals"]);
    return { error: null, success: "Deal quality score updated." };
  });
}

export async function mergeOrganizationsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const keepId = parseAdminIdParam(formString(formData, "keepId"));
    const dropId = parseAdminIdParam(formString(formData, "dropId"));
    if (!keepId || !dropId) {
      return { error: "Choose two organisations to merge.", success: null };
    }
    await mergeOrganizations({ actorId, keepId, dropId });
    revalidateAdmin([
      `/admin/organisations/${keepId}`,
      "/admin/organisations",
      "/admin/deduplication",
    ]);
    return { error: null, success: "Organisations merged." };
  });
}

export async function runSourceIngestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const sourceId = parseAdminIdParam(formString(formData, "sourceId"));
    if (!sourceId) {
      return { error: "That source could not be ingested.", success: null };
    }
    const result = await runManualSourceIngestion({ actorId, sourceId });
    revalidateAdmin([
      `/admin/sources/${sourceId}`,
      "/admin/sources",
      "/admin/ingestion",
    ]);
    if (result.status === "SKIPPED") {
      return {
        error: null,
        success: result.reason ?? "Ingestion skipped by compliance gates.",
      };
    }
    return {
      error: null,
      success: `Ingestion ${result.status.toLowerCase()}.`,
    };
  });
}

export async function reprocessRawRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const rawRecordId = parseAdminIdParam(formString(formData, "rawRecordId"));
    if (!rawRecordId) {
      return { error: "That raw record could not be reprocessed.", success: null };
    }
    const result = await reprocessRawRecord({ actorId, rawRecordId });
    revalidateAdmin([
      `/admin/ingestion/raw/${rawRecordId}`,
      `/admin/deals/${result.dealId}`,
      "/admin/ingestion",
    ]);
    return {
      error: null,
      success: result.published
        ? `Reprocessed into deal ${result.dealId} and published the preview.`
        : `Reprocessed into deal ${result.dealId}. Preview remains unpublished.`,
    };
  });
}

export async function retryMatchJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const jobId = parseAdminIdParam(formString(formData, "jobId"));
    if (!jobId) {
      return { error: "That job could not be retried.", success: null };
    }
    await retryMatchJob({ actorId, jobId });
    revalidateAdmin(["/admin/data-quality"]);
    return { error: null, success: "Match job queued again." };
  });
}

export async function retryDocumentJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAdminAction(async (actorId) => {
    const documentId = parseAdminIdParam(formString(formData, "documentId"));
    if (!documentId) {
      return { error: "That document could not be retried.", success: null };
    }
    await retryDocumentJob({ actorId, documentId });
    revalidateAdmin(["/admin/data-quality"]);
    return { error: null, success: "Document marked pending for reprocessing." };
  });
}
