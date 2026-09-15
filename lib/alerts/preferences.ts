import "server-only";

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { throwIfQueryError } from "@/lib/db/errors";
import {
  DIGEST_CADENCES,
  type DigestCadence,
  type NotificationPreferences,
} from "@/lib/alerts/types";

const PREFERENCE_SELECT =
  "user_id, email_enabled, new_match_enabled, deal_change_enabled, deadline_enabled, renewal_enabled, digest_cadence";

const DEFAULT_PREFS: NotificationPreferences = {
  emailEnabled: true,
  newMatchEnabled: true,
  dealChangeEnabled: true,
  deadlineEnabled: true,
  renewalEnabled: true,
  digestCadence: "DAILY",
  lastDigestSentAt: null,
};

function parseCadence(value: string): DigestCadence {
  return DIGEST_CADENCES.includes(value as DigestCadence)
    ? (value as DigestCadence)
    : "DAILY";
}

export async function loadNotificationPreferences(
  client: PublicSupabaseClient,
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await client
    .from("notification_preferences")
    .select(PREFERENCE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  const row = throwIfQueryError("Failed to load notification preferences", {
    data,
    error,
  });
  if (!row) {
    return DEFAULT_PREFS;
  }
  return {
    emailEnabled: row.email_enabled,
    newMatchEnabled: row.new_match_enabled,
    dealChangeEnabled: row.deal_change_enabled,
    deadlineEnabled: row.deadline_enabled,
    renewalEnabled: row.renewal_enabled,
    digestCadence: parseCadence(row.digest_cadence),
    lastDigestSentAt: null,
  };
}
