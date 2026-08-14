import { describe, expect, it } from "vitest";
import {
  canManageReminderRules,
  canViewPatient,
  isClinicOps,
  type AuthContext
} from "../../lib/permissions";

function auth(partial: Partial<AuthContext> & Pick<AuthContext, "role">): AuthContext {
  return {
    userId: "u1",
    email: "a@b.c",
    organizationId: "org1",
    activeOrganizationId: "org1",
    ...partial
  };
}

describe("Phase 0 permissions", () => {
  it("only clinic ops manage reminder rules", () => {
    expect(canManageReminderRules(auth({ role: "RECEPTIONIST" }))).toBe(true);
    expect(canManageReminderRules(auth({ role: "ADMIN" }))).toBe(true);
    expect(canManageReminderRules(auth({ role: "DOCTOR" }))).toBe(false);
    expect(canManageReminderRules(auth({ role: "PATIENT" }))).toBe(false);
  });

  it("sync canViewPatient denies doctors (async assert required)", () => {
    expect(canViewPatient(auth({ role: "DOCTOR", doctorProfileId: "d1" }), "p1")).toBe(false);
    expect(canViewPatient(auth({ role: "RECEPTIONIST" }), "p1")).toBe(true);
    expect(canViewPatient(auth({ role: "PATIENT", patientProfileId: "p1" }), "p1")).toBe(true);
    expect(canViewPatient(auth({ role: "PATIENT", patientProfileId: "p1" }), "p2")).toBe(false);
  });

  it("isClinicOps excludes doctors", () => {
    expect(isClinicOps(auth({ role: "DOCTOR" }))).toBe(false);
    expect(isClinicOps(auth({ role: "RECEPTIONIST" }))).toBe(true);
  });
});
