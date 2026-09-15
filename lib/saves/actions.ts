"use server";

import { revalidatePath } from "next/cache";

import { getAuthUser, isEmailVerified } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/messages";
import { parseDealIdParam } from "@/lib/deals/paths";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { featureLimit, isAtFeatureLimit, mapQuotaError, QUOTA_ERROR_COPY } from "@/lib/quotas";
import { parseInputSafe, uuidSchema } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALERT_CADENCES,
  savedSearchInputSchema,
  toSavedSearchFilters,
} from "@/lib/saves/filters";
import { countSavedDeals, countSavedSearches, isDealSaved } from "@/lib/saves/queries";
import { parseSignedInSearchParams } from "@/lib/search/params";
import type { Json } from "@/lib/db/database.types";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formFlag(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function revalidateSavePaths(dealId?: string) {
  revalidatePath("/app/saved");
  revalidatePath("/app/searches");
  revalidatePath("/app/search");
  revalidatePath("/app");
  if (dealId) {
    revalidatePath(`/app/deals/${dealId}`);
  }
}

export async function saveDealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to save opportunities.", success: null };
  }
  const dealId = parseDealIdParam(formString(formData, "dealId"));
  if (!dealId) {
    return { error: "That opportunity could not be saved.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  if (await isDealSaved(supabase, user.id, dealId)) {
    return { error: null, success: "Opportunity already saved." };
  }

  const entitlement = await getCurrentEntitlement(user.id);
  const limit = featureLimit(entitlement.plan, "savedDeals");
  const used = await countSavedDeals(supabase, user.id);
  if (isAtFeatureLimit(used, limit)) {
    return { error: QUOTA_ERROR_COPY.savedDeals, success: null };
  }

  const { error } = await supabase.from("saved_deals").insert({
    user_id: user.id,
    deal_id: dealId,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: null, success: "Opportunity already saved." };
    }
    const quota = mapQuotaError(error.message);
    if (quota) {
      return { error: QUOTA_ERROR_COPY[quota], success: null };
    }
    return { error: "That opportunity could not be saved.", success: null };
  }

  revalidateSavePaths(dealId);
  return { error: null, success: "Opportunity saved." };
}

export async function unsaveDealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to manage saved opportunities.", success: null };
  }
  const dealId = parseDealIdParam(formString(formData, "dealId"));
  if (!dealId) {
    return { error: "That saved opportunity could not be removed.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_deals")
    .delete()
    .eq("user_id", user.id)
    .eq("deal_id", dealId);
  if (error) {
    return { error: "That saved opportunity could not be removed.", success: null };
  }

  revalidateSavePaths(dealId);
  return { error: null, success: "Removed from saved opportunities." };
}

export async function saveSearchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    return await saveSearchActionInner(formData);
  } catch (cause) {
    console.error("DealAtlas save search failed", cause);
    return { error: "That search could not be saved.", success: null };
  }
}

async function saveSearchActionInner(formData: FormData): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to save searches.", success: null };
  }
  if (!isEmailVerified(user)) {
    return {
      error: "Confirm your email before saving searches and alerts.",
      success: null,
    };
  }

  const rawFilters = Object.fromEntries(
    ["q", "query", "category", "buyerSector", "region", "valueBand", "deadlineBand", "dealType", "status", "sort", "minScore"].map(
      (key) => [key, formString(formData, key) || undefined],
    ),
  );
  const signedIn = parseSignedInSearchParams(rawFilters);
  const parsed = parseInputSafe(savedSearchInputSchema, {
    name: formString(formData, "name"),
    alertCadence: formString(formData, "alertCadence") || "WEEKLY",
    filters: toSavedSearchFilters(signedIn),
  });
  if (!parsed.success) {
    return { error: "Enter a name and valid filters for this saved search.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const entitlement = await getCurrentEntitlement(user.id);
  const limit = featureLimit(entitlement.plan, "savedSearches");
  const used = await countSavedSearches(supabase, user.id);
  if (isAtFeatureLimit(used, limit)) {
    return {
      error: isProEntitlement(entitlement)
        ? `Pro accounts can save ${limit} searches.`
        : QUOTA_ERROR_COPY.savedSearches,
      success: null,
    };
  }

  const { error } = await supabase.from("saved_searches").insert({
    user_id: user.id,
    name: parsed.data.name,
    filters: parsed.data.filters as Json,
    alert_cadence: parsed.data.alertCadence,
    enabled: true,
  });
  if (error) {
    const quota = mapQuotaError(error.message);
    if (quota) {
      return { error: QUOTA_ERROR_COPY[quota], success: null };
    }
    return { error: "That search could not be saved.", success: null };
  }

  revalidatePath("/app/searches");
  revalidatePath("/app/search");
  revalidatePath("/app");
  return { error: null, success: "Search saved." };
}

export async function updateSavedSearchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to manage saved searches.", success: null };
  }
  if (!isEmailVerified(user)) {
    return {
      error: "Confirm your email before changing saved searches.",
      success: null,
    };
  }
  const id = parseInputSafe(uuidSchema, formString(formData, "id"));
  if (!id.success) {
    return { error: "That saved search could not be updated.", success: null };
  }
  const name = formString(formData, "name").trim();
  const cadence = formString(formData, "alertCadence");
  const enabled = formFlag(formData, "enabled");
  if (!name || name.length > 80) {
    return { error: "Enter a saved search name.", success: null };
  }
  if (!(ALERT_CADENCES as readonly string[]).includes(cadence)) {
    return { error: "Choose a valid alert cadence.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_searches")
    .update({
      name,
      alert_cadence: cadence,
      enabled,
    })
    .eq("id", id.data)
    .eq("user_id", user.id);
  if (error) {
    return { error: "That saved search could not be updated.", success: null };
  }
  revalidatePath("/app/searches");
  return { error: null, success: "Saved search updated." };
}

export async function deleteSavedSearchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to manage saved searches.", success: null };
  }
  const id = parseInputSafe(uuidSchema, formString(formData, "id"));
  if (!id.success) {
    return { error: "That saved search could not be removed.", success: null };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id.data)
    .eq("user_id", user.id);
  if (error) {
    return { error: "That saved search could not be removed.", success: null };
  }
  revalidatePath("/app/searches");
  revalidatePath("/app");
  return { error: null, success: "Saved search removed." };
}
