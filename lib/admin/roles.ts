import { isAdminRole } from "@/lib/auth/roles";
import { ADMIN_ERROR, AdminAccessError } from "@/lib/admin/errors";

export function assertAdminRole(role: string | null | undefined): void {
  if (!isAdminRole(role)) {
    throw new AdminAccessError("FORBIDDEN", ADMIN_ERROR.FORBIDDEN);
  }
}

export function adminCanonicalAccess(userId: string) {
  return { kind: "admin" as const, userId };
}
