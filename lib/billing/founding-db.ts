import "server-only";

import { asFoundingReservation, foundingOfferCopy } from "@/lib/billing/founding";
import type { FoundingReservation } from "@/lib/billing/types";
import { getServerEnv } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Fails closed: unreadable env counts as not configured. */
export function foundingConfigured(): boolean {
  try {
    return Boolean(getServerEnv().DODO_FOUNDING_PRODUCT_ID);
  } catch {
    return false;
  }
}

export async function readFoundingMember(userId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("founding_member")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return data?.founding_member === true;
  } catch {
    return false;
  }
}

export async function reserveFoundingSlot(userId: string): Promise<FoundingReservation> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("reserve_founding_slot", { p_user_id: userId });
    if (error) return "unavailable";
    return asFoundingReservation(data);
  } catch {
    return "unavailable";
  }
}

export async function readFoundingOffer(): Promise<{
  foundingAvailable: boolean;
  note: string | null;
}> {
  if (!foundingConfigured()) return { foundingAvailable: false, note: null };
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("founding_offer");
    if (error) return { foundingAvailable: false, note: null };
    return foundingOfferCopy(data);
  } catch {
    return { foundingAvailable: false, note: null };
  }
}

/** Server-only exact count. Never serialise it to a public response. */
export async function readFoundingRemaining(): Promise<number> {
  if (!foundingConfigured()) return 0;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("founding_availability");
    if (error || typeof data !== "number" || !Number.isInteger(data) || data < 0) return 0;
    return data;
  } catch {
    return 0;
  }
}

export async function syncFoundingSlot(input: {
  userId: string;
  action: "activate" | "close" | "release";
  providerEventId: string;
  subscriptionId: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (input.action === "activate") {
    if (!input.subscriptionId) {
      throw new Error("founding slot update failed");
    }
    const { error } = await admin.rpc("claim_founding_activation", {
      p_event_id: input.providerEventId,
      p_subscription_id: input.subscriptionId,
      p_user_id: input.userId,
    });
    if (error) {
      throw new Error("founding slot update failed");
    }
    return;
  }
  const fn =
    input.action === "close" ? "close_founding_membership" : "release_founding_reservation";
  const { error } = await admin.rpc(fn, { p_user_id: input.userId });
  if (error) {
    throw new Error("founding slot update failed");
  }
}
