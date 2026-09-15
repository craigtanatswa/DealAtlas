import "server-only";

import { requireAdmin } from "@/lib/auth/session";
import { adminCanonicalAccess, assertAdminRole } from "@/lib/admin/roles";
import type { AppAccount } from "@/lib/auth/session";
import type { CanonicalAccess } from "@/lib/db/canonical";

export async function requireAdminAction(
  nextPath = "/admin",
): Promise<AppAccount> {
  const account = await requireAdmin(nextPath);
  assertAdminRole(account.profile.role);
  return account;
}

export function toAdminAccess(account: AppAccount): CanonicalAccess {
  return adminCanonicalAccess(account.user.id);
}
