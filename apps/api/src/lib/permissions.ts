import type { UserRole } from "@prisma/client";

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

export function requireRole(auth: AuthContext, ...roles: UserRole[]): boolean {
  return roles.includes(auth.role);
}

export function isStaff(auth: AuthContext): boolean {
  return STAFF_ROLES.includes(auth.role);
}

export function canViewAuditLogs(auth: AuthContext): boolean {
  return auth.role === "ADMIN" || auth.role === "SUPER_ADMIN";
}

export function canManageAppointments(auth: AuthContext): boolean {
  return CLINIC_MANAGEMENT.includes(auth.role) || auth.role === "DOCTOR";
}

export function canManagePatients(auth: AuthContext): boolean {
  return CLINIC_MANAGEMENT.includes(auth.role) || auth.role === "DOCTOR";
}

export function canManageStaff(auth: AuthContext): boolean {
  return auth.role === "ADMIN" || auth.role === "SUPER_ADMIN";
}

export function canViewPatient(auth: AuthContext, patientProfileId: string): boolean {
  if (auth.role === "PATIENT") return auth.patientProfileId === patientProfileId;
  return isStaff(auth);
}

export function canMessagePatient(auth: AuthContext, patientProfileId: string): boolean {
  if (auth.role === "PATIENT") return auth.patientProfileId === patientProfileId;
  return CLINIC_MANAGEMENT.includes(auth.role) || auth.role === "DOCTOR";
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
