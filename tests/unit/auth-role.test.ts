import { describe, expect, it } from "vitest";

import { ROLES } from "@/lib/constants";
import {
  profileInsertFromAuthUser,
  missingProfileInsert,
} from "@/lib/auth/profile-insert";
import { isAdminRole, resolveAppRole } from "@/lib/auth/roles";

describe("application role resolution", () => {
  it("treats only the profiles.role ADMIN value as admin", () => {
    expect(resolveAppRole("ADMIN")).toBe(ROLES.ADMIN);
    expect(resolveAppRole("USER")).toBe(ROLES.USER);
    expect(resolveAppRole("admin")).toBe(ROLES.USER);
    expect(resolveAppRole(undefined)).toBe(ROLES.USER);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("USER")).toBe(false);
  });

  it("never copies role from auth metadata into a recovery insert", () => {
    const insert = profileInsertFromAuthUser({
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      user_metadata: {
        name: "Ada Lovelace",
        role: "ADMIN",
        app_role: "ADMIN",
      },
    });

    expect(insert).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      display_name: "Ada Lovelace",
      role: ROLES.USER,
    });
    expect(missingProfileInsert({ id: insert.id, email: insert.email }).role).toBe(
      ROLES.USER,
    );
  });
});
