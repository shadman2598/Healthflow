import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPermission,
  permissionsForRole,
  resolveRbacRole,
  ROLE_PERMISSIONS,
  type Permission
} from "@technovate/shared";
import { assertSameOrganization, assertActiveOrgAllowed } from "../org-scope";
import {
  authHasPermission,
  canManageReminderRules,
  canManageStaff,
  canViewAuditLogs,
  canViewPatient,
  isClinicOps,
  isStaff,
  type AuthContext
} from "../permissions";
import { AppError } from "../../errors/app-error";

const findFirst = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    patientProfile: {
      findFirst: (...args: unknown[]) => findFirst(...args)
    }
  }
}));

import {
  assertCanAccessMessageThread,
  assertCanViewPatientProfile
} from "../patient-access";

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
  it("maps product personas to persisted roles", () => {
    expect(resolveRbacRole("CLINICIAN")).toBe("DOCTOR");
    expect(resolveRbacRole("ADMINISTRATOR")).toBe("ADMIN");
    expect(resolveRbacRole("STAFF")).toBe("NURSE");
    expect(permissionsForRole("CLINICIAN")).toEqual(ROLE_PERMISSIONS.DOCTOR);
  });

  it("grants patients only self-scoped capabilities", () => {
    expect(hasPermission("PATIENT", "patient:read_own")).toBe(true);
    expect(hasPermission("PATIENT", "appointment:request_own")).toBe(true);
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

  it("scopes clinician (DOCTOR) to assigned-panel permissions", () => {
    expect(hasPermission("DOCTOR", "patient:read_assigned")).toBe(true);
    expect(hasPermission("DOCTOR", "patient:create")).toBe(false);
    expect(hasPermission("DOCTOR", "appointment:create_own_schedule")).toBe(true);
    expect(hasPermission("DOCTOR", "appointment:create_clinic")).toBe(false);
    expect(hasPermission("DOCTOR", "reminder:manage_rules")).toBe(false);
  });

  it("nurse least privilege: clinical vitals, no staff admin or schedule CRUD", () => {
    expect(hasPermission("NURSE", "clinical:update_vitals")).toBe(true);
    expect(hasPermission("NURSE", "patient:read_clinic")).toBe(true);
    expect(hasPermission("NURSE", "appointment:create_clinic")).toBe(false);
    expect(hasPermission("NURSE", "staff:manage")).toBe(false);
    expect(hasPermission("NURSE", "billing:manage_invoices")).toBe(false);
  });

  it("billing least privilege: invoices, no messaging or HCN reveal", () => {
    expect(hasPermission("BILLING", "billing:manage_invoices")).toBe(true);
    expect(hasPermission("BILLING", "patient:read_clinic")).toBe(true);
    expect(hasPermission("BILLING", "message:reply")).toBe(false);
    expect(hasPermission("BILLING", "patient:reveal_hcn")).toBe(false);
    expect(hasPermission("BILLING", "audit:read")).toBe(false);
  });

  it("administrator has audit + staff", () => {
    expect(hasPermission("ADMIN", "audit:read")).toBe(true);
    expect(hasPermission("ADMIN", "staff:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "clinic:switch_org")).toBe(true);
  });

  it("denies unknown roles everything", () => {
    expect(permissionsForRole("HACKER")).toEqual([]);
    expect(hasPermission("HACKER", "audit:read")).toBe(false);
  });
});

describe("authorized vs unauthorized access (catalog)", () => {
  const privileged: Permission[] = [
    "audit:read",
    "staff:manage",
    "clinic:switch_org",
    "reminder:manage_rules"
  ];

  it("authorized: receptionist manages reminder rules", () => {
    expect(hasPermission("RECEPTIONIST", "reminder:manage_rules")).toBe(true);
  });

  it("unauthorized: patient cannot escalate to privileged permissions", () => {
    for (const p of privileged) {
      expect(hasPermission("PATIENT", p)).toBe(false);
    }
  });

  it("unauthorized: clinician cannot manage staff or switch org", () => {
    expect(hasPermission("DOCTOR", "staff:manage")).toBe(false);
    expect(hasPermission("DOCTOR", "clinic:switch_org")).toBe(false);
    expect(hasPermission("DOCTOR", "audit:read")).toBe(false);
  });

  it("unauthorized: billing cannot reply to clinical messages", () => {
    expect(hasPermission("BILLING", "message:reply")).toBe(false);
  });
});

describe("cross-patient sync guards", () => {
  it("blocks patient A from viewing patient B", () => {
    const patient = auth({ role: "PATIENT", patientProfileId: "p-a" });
    expect(canViewPatient(patient, "p-a")).toBe(true);
    expect(canViewPatient(patient, "p-b")).toBe(false);
  });

  it("forces clinicians through async resource checks (sync deny)", () => {
    expect(canViewPatient(auth({ role: "DOCTOR", doctorProfileId: "d1" }), "p1")).toBe(false);
  });

  it("allows nurse/billing directory read via permission", () => {
    expect(canViewPatient(auth({ role: "NURSE" }), "p1")).toBe(true);
    expect(canViewPatient(auth({ role: "BILLING" }), "p1")).toBe(true);
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

  it("blocks non-admin active-org pivot away from home org", () => {
    expect(() =>
      assertActiveOrgAllowed(
        auth({ role: "RECEPTIONIST", organizationId: "org-a", activeOrganizationId: "org-b" })
      )
    ).toThrow(AppError);
  });

  it("allows admin org switch cookie path", () => {
    expect(() =>
      assertActiveOrgAllowed(
        auth({ role: "ADMIN", organizationId: "org-a", activeOrganizationId: "org-b" })
      )
    ).not.toThrow();
  });
});

describe("resource-level patient access", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("authorized: patient views self", async () => {
    await expect(
      assertCanViewPatientProfile(auth({ role: "PATIENT", patientProfileId: "p1" }), "p1")
    ).resolves.toBeUndefined();
  });

  it("unauthorized: cross-patient access", async () => {
    await expect(
      assertCanViewPatientProfile(auth({ role: "PATIENT", patientProfileId: "p1" }), "p2")
    ).rejects.toBeInstanceOf(AppError);
  });

  it("authorized: nurse views clinic patient in org", async () => {
    findFirst.mockResolvedValueOnce({ id: "p1" });
    await expect(
      assertCanViewPatientProfile(auth({ role: "NURSE", activeOrganizationId: "org-home" }), "p1")
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalled();
  });

  it("unauthorized: clinician without assignment", async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(
      assertCanViewPatientProfile(
        auth({ role: "DOCTOR", doctorProfileId: "d1", activeOrganizationId: "org-home" }),
        "p-other"
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("authorized: clinician with assigned panel hit", async () => {
    findFirst.mockResolvedValueOnce({ id: "p1" });
    await expect(
      assertCanViewPatientProfile(
        auth({ role: "DOCTOR", doctorProfileId: "d1", activeOrganizationId: "org-home" }),
        "p1"
      )
    ).resolves.toBeUndefined();
  });
});

describe("message thread authorization", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("unauthorized: billing has no message permissions", async () => {
    await expect(
      assertCanAccessMessageThread(auth({ role: "BILLING" }), {
        patientProfileId: "p1",
        assignedDoctorId: null
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("authorized: nurse clinic inbox", async () => {
    await expect(
      assertCanAccessMessageThread(auth({ role: "NURSE" }), {
        patientProfileId: "p1",
        assignedDoctorId: "d9"
      })
    ).resolves.toBeUndefined();
  });

  it("unauthorized: patient reading another patient's thread", async () => {
    await expect(
      assertCanAccessMessageThread(auth({ role: "PATIENT", patientProfileId: "p1" }), {
        patientProfileId: "p2",
        assignedDoctorId: null
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("privilege escalation / revoked permissions", () => {
  it("role change from ADMIN to PATIENT drops privileged perms", () => {
    const before = auth({ role: "ADMIN" });
    expect(authHasPermission(before, "audit:read")).toBe(true);
    const after = auth({ role: "PATIENT", patientProfileId: "p1" });
    expect(authHasPermission(after, "audit:read")).toBe(false);
    expect(authHasPermission(after, "staff:manage")).toBe(false);
  });

  it("role change from RECEPTIONIST to BILLING revokes reminder rule manage", () => {
    expect(canManageReminderRules(auth({ role: "RECEPTIONIST" }))).toBe(true);
    expect(canManageReminderRules(auth({ role: "BILLING" }))).toBe(false);
  });

  it("isClinicOps excludes nurse/billing/doctor (mutation surface)", () => {
    expect(isClinicOps(auth({ role: "RECEPTIONIST" }))).toBe(true);
    expect(isClinicOps(auth({ role: "NURSE" }))).toBe(false);
    expect(isClinicOps(auth({ role: "BILLING" }))).toBe(false);
    expect(isClinicOps(auth({ role: "DOCTOR" }))).toBe(false);
  });

  it("isStaff includes nurse and billing", () => {
    expect(isStaff(auth({ role: "NURSE" }))).toBe(true);
    expect(isStaff(auth({ role: "BILLING" }))).toBe(true);
    expect(isStaff(auth({ role: "PATIENT" }))).toBe(false);
  });

  it("mirrors catalog for audit/staff helpers", () => {
    expect(canViewAuditLogs(auth({ role: "ADMIN" }))).toBe(true);
    expect(canViewAuditLogs(auth({ role: "PATIENT" }))).toBe(false);
    expect(canManageStaff(auth({ role: "ADMIN" }))).toBe(true);
    expect(canManageStaff(auth({ role: "NURSE" }))).toBe(false);
  });
});
