import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  permissionsForRole,
  type Permission
} from "@technovate/shared";
import type { HealthFlowRole } from "../types/healthflow";

export type { Permission };

export function roleHasPermission(role: HealthFlowRole | string, permission: Permission): boolean {
  return hasPermission(role, permission);
}

export function roleHasAllPermissions(
  role: HealthFlowRole | string,
  permissions: Permission[]
): boolean {
  return hasAllPermissions(role, permissions);
}

export function roleHasAnyPermission(
  role: HealthFlowRole | string,
  permissions: Permission[]
): boolean {
  return hasAnyPermission(role, permissions);
}

export function rolePermissions(role: HealthFlowRole | string): readonly Permission[] {
  return permissionsForRole(role);
}

/** Map nav/features to permissions for progressive UI hiding. */
export const FEATURE_PERMISSIONS = {
  auditLogs: "audit:read",
  staffAdmin: "staff:manage",
  reminderRules: "reminder:manage_rules",
  clinicSettings: "clinic:settings",
  createPatient: "patient:create",
  revealHcn: "patient:reveal_hcn",
  manageInvoices: "billing:manage_invoices",
  updateVitals: "clinical:update_vitals",
  clinicPatientDirectory: "patient:read_clinic",
  assignedPatients: "patient:read_assigned",
  aiAdminAssist: "ai:use_admin",
  aiClinicalAssist: "ai:use_clinical_assist",
  aiReview: "ai:review"
} as const satisfies Record<string, Permission>;

/** Resolve product persona aliases for UX (mirrors shared resolveRbacRole). */
export function normalizeProductRole(role: string): string {
  if (role === "CLINICIAN") return "DOCTOR";
  if (role === "ADMINISTRATOR") return "ADMIN";
  if (role === "STAFF") return "NURSE";
  return role;
}
