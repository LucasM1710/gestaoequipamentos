import { describe, expect, it } from "vitest";
import { getDefaultRoute, getPermissions } from "@/lib/permissions";

describe("permissions", () => {
  it("gives admin access to restricted areas", () => {
    const permissions = getPermissions("admin");
    expect(permissions.canManageUsers).toBe(true);
    expect(permissions.canViewLogs).toBe(true);
  });

  it("gives gestor access to users, logs and crm in read-only mode", () => {
    const permissions = getPermissions("gestor");
    expect(permissions.canManageUsers).toBe(true);
    expect(permissions.canViewLogs).toBe(true);
    expect(permissions.canViewCrm).toBe(true);
    expect(permissions.canMoveCrmCards).toBe(false);
  });

  it("routes field users to equipamentos", () => {
    expect(getDefaultRoute("usuario")).toBe("/equipamentos");
  });
});
