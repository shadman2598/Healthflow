import { describe, expect, it } from "vitest";
import { hasAllPermissions, hasAnyPermission } from "@technovate/shared";
import type { AuthContext } from "../../lib/permissions";

/**
 * Middleware behavior is pure role→permission evaluation.
 * These tests lock the contract requirePermissions / requireAnyPermission rely on.
 */
describe("requirePermission middleware contract", () => {
  const cases: Array<{ role: AuthContext["role"]; ok: boolean; perms: string[] }> = [
    { role: "PATIENT", ok: false, perms: ["audit:read"] },
    { role: "DOCTOR", ok: false, perms: ["reminder:manage_rules"] },
    { role: "RECEPTIONIST", ok: true, perms: ["reminder:manage_rules"] },
    { role: "NURSE", ok: false, perms: ["reminder:manage_rules"] },
    { role: "NURSE", ok: true, perms: ["clinical:update_vitals"] },
    { role: "BILLING", ok: true, perms: ["billing:manage_invoices"] },
    { role: "BILLING", ok: false, perms: ["message:reply"] },
    { role: "ADMIN", ok: true, perms: ["audit:read", "staff:manage"] },
    { role: "SUPER_ADMIN", ok: true, perms: ["clinic:switch_org"] }
  ];

  it.each(cases)("$role AND $perms → $ok", ({ role, ok, perms }) => {
    expect(hasAllPermissions(role, perms as never)).toBe(ok);
  });

  it("OR semantics: doctor has reply or manage_rules via reply only", () => {
    expect(hasAnyPermission("DOCTOR", ["reminder:manage_rules", "message:reply"])).toBe(true);
    expect(hasAnyPermission("PATIENT", ["audit:read", "staff:manage"])).toBe(false);
    expect(hasAnyPermission("BILLING", ["message:reply", "billing:manage_invoices"])).toBe(true);
  });
});
