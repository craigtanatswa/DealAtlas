import { ROLES, type Role } from "@/lib/constants";

/**
 * Application role is taken only from the server-controlled profiles row.
 * Never pass auth metadata, JWT claims, or client-supplied values here.
 */
export function resolveAppRole(profileRole: string | null | undefined): Role {
  return profileRole === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER;
}

export function isAdminRole(profileRole: string | null | undefined): boolean {
  return resolveAppRole(profileRole) === ROLES.ADMIN;
}
