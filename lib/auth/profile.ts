import "server-only";

import type { User } from "@supabase/supabase-js";

import { ROLES } from "@/lib/constants";
import { DatabaseQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileInsertFromAuthUser } from "@/lib/auth/profile-insert";
import { resolveAppRole } from "@/lib/auth/roles";
import type { AppProfile } from "@/lib/auth/types";

export type { AppProfile };

const PROFILE_COLUMNS = "id, email, display_name, role, created_at, updated_at";

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
};

function normalizeProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: resolveAppRole(row.role),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function recoverMissingProfile(user: User): Promise<void> {
  const admin = createSupabaseAdminClient();
  const insert = profileInsertFromAuthUser(user);

  const { error } = await admin.from("profiles").insert({
    id: insert.id,
    email: insert.email,
    display_name: insert.display_name,
    role: ROLES.USER,
  });

  if (error && error.code !== "23505") {
    throw new DatabaseQueryError(`Profile recovery failed: ${error.message}`, error);
  }

  const preferences = await admin.from("notification_preferences").insert({
    user_id: user.id,
  });
  if (preferences.error && preferences.error.code !== "23505") {
    throw new DatabaseQueryError(
      `Notification preference recovery failed: ${preferences.error.message}`,
      preferences.error,
    );
  }
}

async function syncProfileEmail(user: User, profile: ProfileRow): Promise<ProfileRow> {
  if (!user.email || user.email === profile.email) {
    return profile;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ email: user.email })
    .eq("id", user.id);

  if (error) {
    throw new DatabaseQueryError(`Profile email sync failed: ${error.message}`, error);
  }

  return { ...profile, email: user.email };
}

export async function getProfileForUser(user: User): Promise<AppProfile> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (result.error) {
    throw new DatabaseQueryError(`Failed to load profile: ${result.error.message}`, result.error);
  }

  let row = result.data;

  if (!row) {
    await recoverMissingProfile(user);
    const retry = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();

    if (retry.error) {
      throw new DatabaseQueryError(`Failed to load recovered profile: ${retry.error.message}`, retry.error);
    }
    if (!retry.data) {
      throw new DatabaseQueryError("Profile was not created for this account.");
    }
    row = retry.data;
  }

  const synced = await syncProfileEmail(user, row);
  return normalizeProfile(synced);
}
