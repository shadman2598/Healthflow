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
  revealHcn: "patient:reveal_hcn"
} as const satisfies Record<string, Permission>;
