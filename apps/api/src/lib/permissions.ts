import type { UserRole } from "@prisma/client";
import { hasPermission, type Permission } from "@technovate/shared";

export type AuthContext = {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  activeOrganizationId: string;
  patientProfileId?: string;
  doctorProfileId?: string;
};

const STAFF_ROLES: UserRole[] = ["RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"];
const CLINIC_MANAGEMENT: UserRole[] = ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"];

/** @deprecated Prefer REMINDER_RULE via permission catalog — kept for route wiring. */
export const REMINDER_RULE_ROLES: UserRole[] = ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"];

export function requireRole(auth: AuthContext, ...roles: UserRole[]): boolean {
  return roles.includes(auth.role);
}

export function authHasPermission(auth: AuthContext, permission: Permission): boolean {
  return hasPermission(auth.role, permission);
}

export function isStaff(auth: AuthContext): boolean {
  return STAFF_ROLES.includes(auth.role);
}

/** Reception / admin — full clinic patient & schedule access (not doctor-scoped). */
export function isClinicOps(auth: AuthContext): boolean {
  return CLINIC_MANAGEMENT.includes(auth.role);
}

export function canViewAuditLogs(auth: AuthContext): boolean {
  return authHasPermission(auth, "audit:read");
}

export function canManageAppointments(auth: AuthContext): boolean {
  return (
    authHasPermission(auth, "appointment:create_clinic") ||
    authHasPermission(auth, "appointment:create_own_schedule")
  );
}

export function canManagePatients(auth: AuthContext): boolean {
  return (
    authHasPermission(auth, "patient:read_clinic") ||
    authHasPermission(auth, "patient:read_assigned")
  );
}

export function canManageStaff(auth: AuthContext): boolean {
  return authHasPermission(auth, "staff:manage");
}

export function canManageReminderRules(auth: AuthContext): boolean {
  return authHasPermission(auth, "reminder:manage_rules");
}

/**
 * Sync check only — patients self, clinic ops all profiles.
 * Doctors must use assertCanViewPatientProfile (assigned or shared appointment).
 */
export function canViewPatient(auth: AuthContext, patientProfileId: string): boolean {
  if (auth.role === "PATIENT") return auth.patientProfileId === patientProfileId;
  if (auth.role === "DOCTOR") return false;
  return isClinicOps(auth);
}

export function canMessagePatient(auth: AuthContext, patientProfileId: string): boolean {
  if (auth.role === "PATIENT") return auth.patientProfileId === patientProfileId;
  if (auth.role === "DOCTOR") return false;
  return isClinicOps(auth);
}

export function roleDashboardPath(role: UserRole): string {
  switch (role) {
    case "PATIENT":
      return "/patient/dashboard";
    case "RECEPTIONIST":
      return "/receptionist/dashboard";
    case "DOCTOR":
      return "/doctor/dashboard";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    default:
      return "/login";
  }
}

export function roleLoginPath(role: UserRole): string {
  switch (role) {
    case "PATIENT":
      return "/login/patient";
    case "RECEPTIONIST":
      return "/login/receptionist";
    case "DOCTOR":
      return "/login/doctor";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/login/admin";
    default:
      return "/login";
  }
}
