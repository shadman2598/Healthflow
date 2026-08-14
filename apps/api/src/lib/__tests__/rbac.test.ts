import { describe, expect, it } from "vitest";
import {
  hasPermission,
  permissionsForRole,
  resolveRbacRole,
  ROLE_PERMISSIONS,
  type Permission
} from "@technovate/shared";
import { assertSameOrganization } from "../org-scope";
import {
  authHasPermission,
  canManageReminderRules,
  canManageStaff,
  canViewAuditLogs,
  canViewPatient,
  type AuthContext
} from "../permissions";
import { AppError } from "../../errors/app-error";

function auth(partial: Partial<AuthContext> & Pick<AuthContext, "role">): AuthContext {
  return {
    userId: "u1",
    email: "a@b.c",
    organizationId: "org-home",
    activeOrganizationId: "org-home",
    ...partial
  };
}

describe("RBAC permission catalog", () => {
  it("maps CLINICIAN alias to DOCTOR permissions", () => {
    expect(resolveRbacRole("CLINICIAN")).toBe("DOCTOR");
    expect(permissionsForRole("CLINICIAN")).toEqual(ROLE_PERMISSIONS.DOCTOR);
  });

  it("grants patients only self-scoped capabilities", () => {
    expect(hasPermission("PATIENT", "patient:read_own")).toBe(true);
    expect(hasPermission("PATIENT", "patient:read_clinic")).toBe(false);
    expect(hasPermission("PATIENT", "audit:read")).toBe(false);
    expect(hasPermission("PATIENT", "reminder:manage_rules")).toBe(false);
    expect(hasPermission("PATIENT", "staff:manage")).toBe(false);
  });

  it("allows receptionist clinic ops without audit/staff admin", () => {
    expect(hasPermission("RECEPTIONIST", "patient:create")).toBe(true);
    expect(hasPermission("RECEPTIONIST", "reminder:manage_rules")).toBe(true);
    expect(hasPermission("RECEPTIONIST", "audit:read")).toBe(false);
    expect(hasPermission("RECEPTIONIST", "staff:manage")).toBe(false);
  });

  it("scopes doctor to assigned-panel permissions, not clinic-wide create", () => {
    expect(hasPermission("DOCTOR", "patient:read_assigned")).toBe(true);
    expect(hasPermission("DOCTOR", "patient:create")).toBe(false);
    expect(hasPermission("DOCTOR", "appointment:create_own_schedule")).toBe(true);
    expect(hasPermission("DOCTOR", "appointment:create_clinic")).toBe(false);
    expect(hasPermission("DOCTOR", "reminder:manage_rules")).toBe(false);
  });

  it("defines nurse and billing least-privilege matrices before activation", () => {
    expect(hasPermission("NURSE", "clinical:update_intake")).toBe(true);
    expect(hasPermission("NURSE", "staff:manage")).toBe(false);
    expect(hasPermission("BILLING", "billing:manage_invoices")).toBe(true);
    expect(hasPermission("BILLING", "message:reply")).toBe(false);
    expect(hasPermission("BILLING", "patient:reveal_hcn")).toBe(false);
  });

  it("gives admin audit + staff without granting patient self-only nonsense collisions", () => {
    expect(hasPermission("ADMIN", "audit:read")).toBe(true);
    expect(hasPermission("ADMIN", "staff:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "clinic:switch_org")).toBe(true);
  });

  it("denies unknown roles everything", () => {
    expect(permissionsForRole("HACKER")).toEqual([]);
    expect(hasPermission("HACKER", "audit:read")).toBe(false);
  });
});

describe("privilege escalation attempts (catalog)", () => {
  const privileged: Permission[] = ["audit:read", "staff:manage", "clinic:switch_org", "reminder:manage_rules"];

  it("patient cannot escalate to privileged permissions", () => {
    for (const p of privileged) {
      expect(hasPermission("PATIENT", p)).toBe(false);
    }
  });

  it("doctor cannot manage staff or switch org", () => {
    expect(hasPermission("DOCTOR", "staff:manage")).toBe(false);
    expect(hasPermission("DOCTOR", "clinic:switch_org")).toBe(false);
    expect(hasPermission("DOCTOR", "audit:read")).toBe(false);
  });
});

describe("cross-patient sync guards", () => {
  it("blocks patient A from viewing patient B via sync helper", () => {
    const patient = auth({ role: "PATIENT", patientProfileId: "p-a" });
    expect(canViewPatient(patient, "p-a")).toBe(true);
    expect(canViewPatient(patient, "p-b")).toBe(false);
  });

  it("forces doctors through async resource checks (sync deny)", () => {
    expect(canViewPatient(auth({ role: "DOCTOR", doctorProfileId: "d1" }), "p1")).toBe(false);
  });
});

describe("cross-clinic org scope", () => {
  it("allows matching active organization", () => {
    expect(() =>
      assertSameOrganization(auth({ role: "RECEPTIONIST", activeOrganizationId: "org-a" }), "org-a")
    ).not.toThrow();
  });

  it("blocks cross-clinic resource access", () => {
    expect(() =>
      assertSameOrganization(auth({ role: "RECEPTIONIST", activeOrganizationId: "org-a" }), "org-b")
    ).toThrow(AppError);
  });

  it("blocks missing organization id", () => {
    expect(() => assertSameOrganization(auth({ role: "ADMIN" }), null)).toThrow(AppError);
  });
});

describe("auth helper wrappers", () => {
  it("mirrors catalog for audit/staff/reminder rules", () => {
    expect(canViewAuditLogs(auth({ role: "ADMIN" }))).toBe(true);
    expect(canViewAuditLogs(auth({ role: "PATIENT" }))).toBe(false);
    expect(canManageStaff(auth({ role: "ADMIN" }))).toBe(true);
    expect(canManageStaff(auth({ role: "RECEPTIONIST" }))).toBe(false);
    expect(canManageReminderRules(auth({ role: "RECEPTIONIST" }))).toBe(true);
    expect(canManageReminderRules(auth({ role: "DOCTOR" }))).toBe(false);
    expect(hasPermission("BILLING", "billing:manage_invoices")).toBe(true);
  });
});

describe("revoked permission simulation", () => {
  it("role change from ADMIN to PATIENT drops privileged perms", () => {
    const before = auth({ role: "ADMIN" });
    expect(authHasPermission(before, "audit:read")).toBe(true);
    const after = auth({ role: "PATIENT", patientProfileId: "p1" });
    expect(authHasPermission(after, "audit:read")).toBe(false);
    expect(authHasPermission(after, "staff:manage")).toBe(false);
  });
});
