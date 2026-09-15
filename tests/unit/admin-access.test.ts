import { describe, expect, it } from "vitest";

import { AdminAccessError } from "@/lib/admin/errors";
import { assertAdminRole } from "@/lib/admin/roles";
import { ROLES } from "@/lib/constants";

describe("admin role gate", () => {
  it("rejects USER and missing roles before any admin work", () => {
    expect(() => assertAdminRole(ROLES.USER)).toThrow(AdminAccessError);
    expect(() => assertAdminRole("USER")).toThrow(/Administrator access/);
    expect(() => assertAdminRole(null)).toThrow(AdminAccessError);
    expect(() => assertAdminRole("admin")).toThrow(AdminAccessError);
  });

  it("accepts only profiles.role ADMIN", () => {
    expect(() => assertAdminRole(ROLES.ADMIN)).not.toThrow();
  });
});
