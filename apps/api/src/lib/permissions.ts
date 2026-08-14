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

const STAFF_ROLES: UserRole[] = [
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "BILLING",
  "ADMIN",
  "SUPER_ADMIN"
];

/** Full front-desk / admin ops (not nurse/billing/doctor). */
const CLINIC_MANAGEMENT: UserRole[] = ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"];

/** @deprecated Prefer permission catalog — kept for route wiring. */
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

/** Reception / admin — full clinic patient & schedule mutations. */
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
 * Sync check only — patients self; clinic-directory roles (reception/nurse/billing/admin);
 * Doctors must use assertCanViewPatientProfile (assigned or shared appointment).
 */
export function canViewPatient(auth: AuthContext, patientProfileId: string): boolean {
  if (authHasPermission(auth, "patient:read_own")) {
    return auth.patientProfileId === patientProfileId;
  }
  if (authHasPermission(auth, "patient:read_clinic")) return true;
  if (authHasPermission(auth, "patient:read_assigned")) return false;
  return false;
}

export function canMessagePatient(auth: AuthContext, patientProfileId: string): boolean {
  if (auth.role === "PATIENT") return auth.patientProfileId === patientProfileId;
  if (authHasPermission(auth, "message:read_clinic")) return true;
  if (authHasPermission(auth, "message:read_assigned_inbox")) return false;
  return false;
}

export function roleDashboardPath(role: UserRole): string {
  switch (role) {
    case "PATIENT":
      return "/patient/dashboard";
    case "RECEPTIONIST":
    case "NURSE":
      return "/receptionist/dashboard";
    case "DOCTOR":
      return "/doctor/dashboard";
    case "BILLING":
      return "/resources";
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
    case "NURSE":
      return "/login/receptionist";
    case "DOCTOR":
      return "/login/doctor";
    case "BILLING":
      return "/login/admin";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/login/admin";
    default:
      return "/login";
  }
}
