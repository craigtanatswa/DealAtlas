import "server-only";

import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getProfileForUser } from "@/lib/auth/profile";
import type { AppProfile } from "@/lib/auth/types";
import { loginPathWithNext } from "@/lib/auth/redirect";
import { isAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppAccount = {
  user: User;
  profile: AppProfile;
};

export function isEmailVerified(user: User): boolean {
  return Boolean(user.email_confirmed_at);
}

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const getCurrentAccount = cache(async (): Promise<AppAccount | null> => {
  const user = await getAuthUser();
  if (!user) {
    return null;
  }

  const profile = await getProfileForUser(user);
  return { user, profile };
});

export async function requireUser(nextPath = "/app"): Promise<AppAccount> {
  const account = await getCurrentAccount();
  if (!account) {
    redirect(loginPathWithNext(nextPath));
  }

  return account;
}

export async function requireAdmin(nextPath = "/admin"): Promise<AppAccount> {
  const account = await requireUser(nextPath);
  if (!isAdminRole(account.profile.role)) {
    forbidden();
  }
  return account;
}
