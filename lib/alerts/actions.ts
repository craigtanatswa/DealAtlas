"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthUser, isEmailVerified } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/messages";
import { markAlertStatus } from "@/lib/alerts/centre";
import { ALERT_STATUSES, DIGEST_CADENCES } from "@/lib/alerts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInputSafe, uuidSchema } from "@/lib/validation";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formFlag(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export async function saveNotificationPreferencesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to update alert preferences.", success: null };
  }
  if (!isEmailVerified(user) && formFlag(formData, "emailEnabled")) {
    return {
      error: "Confirm your email before enabling email alerts.",
      success: null,
    };
  }

  const cadence = formString(formData, "digestCadence");
  if (!(DIGEST_CADENCES as readonly string[]).includes(cadence)) {
    return { error: "Choose a valid digest cadence.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const patch = {
    email_enabled: formFlag(formData, "emailEnabled"),
    new_match_enabled: formFlag(formData, "newMatchEnabled"),
    deal_change_enabled: formFlag(formData, "dealChangeEnabled"),
    deadline_enabled: formFlag(formData, "deadlineEnabled"),
    renewal_enabled: formFlag(formData, "renewalEnabled"),
    digest_cadence: cadence,
  };
  const existing = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.error) {
    return { error: "Alert preferences could not be saved.", success: null };
  }

  const { error } = existing.data
    ? await supabase
        .from("notification_preferences")
        .update(patch)
        .eq("user_id", user.id)
    : await supabase.from("notification_preferences").insert({
        user_id: user.id,
        ...patch,
      });
  if (error) {
    return { error: "Alert preferences could not be saved.", success: null };
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/alerts");
  return { error: null, success: "Alert preferences saved." };
}

export async function markAlertReadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { error: "Sign in to manage alerts.", success: null };
  }
  const id = parseInputSafe(uuidSchema, formString(formData, "alertId"));
  const status = parseInputSafe(
    z.enum(ALERT_STATUSES),
    formString(formData, "status") || "READ",
  );
  if (!id.success || !status.success) {
    return { error: "That alert could not be updated.", success: null };
  }
  await markAlertStatus({
    userId: user.id,
    alertId: id.data,
    status: status.data,
  });
  revalidatePath("/app/alerts");
  return { error: null, success: "Alert updated." };
}
