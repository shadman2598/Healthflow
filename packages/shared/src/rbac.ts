/**
 * HealthFlow RBAC catalog — shared by API (enforcement) and web (UX guards).
 * Backend remains the security boundary; frontend checks are for UX only.
 *
 * CLINICIAN in product language maps to DOCTOR in the data model.
 * NURSE and BILLING are defined here for least-privilege readiness; activate
 * in Prisma UserRole + signup when those personas ship.
 */

export const PERMISSIONS = [
  // Patients / directory
  "patient:read_own",
  "patient:read_clinic",
  "patient:read_assigned",
  "patient:create",
  "patient:update_clinic",
  "patient:update_own_prefs",
  "patient:reveal_hcn",

  // Appointments
  "appointment:read_own",
  "appointment:read_clinic",
  "appointment:read_own_schedule",
  "appointment:create_clinic",
  "appointment:create_own_schedule",
  "appointment:update_clinic",
  "appointment:update_own_schedule",
  "appointment:update_own_status",
  "appointment:delete_clinic",

  // Messaging
  "message:read_own",
  "message:read_clinic",
  "message:read_assigned_inbox",
  "message:create_own",
  "message:reply",
  "message:manage_thread",

  // Reminders
  "reminder:read_own",
  "reminder:read_clinic",
  "reminder:manage_clinic",
  "reminder:manage_rules",

  // Billing (future-facing)
  "billing:read_fees",
  "billing:manage_invoices",

  // Staff / admin
  "staff:read",
  "staff:manage",
  "audit:read",
  "clinic:settings",
  "clinic:switch_org",

  // Clinical support (nurse-oriented)
  "clinical:read_chart_summary",
  "clinical:update_intake"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Roles recognized by the permission matrix (includes future personas). */
export type RbacRole =
  | "PATIENT"
  | "RECEPTIONIST"
  | "DOCTOR"
  | "NURSE"
  | "BILLING"
  | "ADMIN"
  | "SUPER_ADMIN";

const ALL_STAFF_READ_FEES: Permission[] = ["billing:read_fees"];

const PATIENT_PERMS: Permission[] = [
  "patient:read_own",
  "patient:update_own_prefs",
  "appointment:read_own",
  "appointment:update_own_status",
  "message:read_own",
  "message:create_own",
  "message:reply",
  "reminder:read_own",
  "billing:read_fees"
];

const RECEPTIONIST_PERMS: Permission[] = [
  ...ALL_STAFF_READ_FEES,
  "patient:read_clinic",
  "patient:create",
  "patient:update_clinic",
  "patient:reveal_hcn",
  "appointment:read_clinic",
  "appointment:create_clinic",
  "appointment:update_clinic",
  "appointment:delete_clinic",
  "message:read_clinic",
  "message:reply",
  "message:manage_thread",
  "reminder:read_clinic",
  "reminder:manage_clinic",
  "reminder:manage_rules"
];

const DOCTOR_PERMS: Permission[] = [
  ...ALL_STAFF_READ_FEES,
  "patient:read_assigned",
  "patient:reveal_hcn",
  "appointment:read_own_schedule",
  "appointment:create_own_schedule",
  "appointment:update_own_schedule",
  "message:read_assigned_inbox",
  "message:reply",
  "message:manage_thread",
  "reminder:read_clinic",
  "reminder:manage_clinic",
  "clinical:read_chart_summary"
];

const NURSE_PERMS: Permission[] = [
  ...ALL_STAFF_READ_FEES,
  "patient:read_clinic",
  "patient:reveal_hcn",
  "appointment:read_clinic",
  "message:read_clinic",
  "message:reply",
  "clinical:read_chart_summary",
  "clinical:update_intake",
  "reminder:read_clinic"
];

const BILLING_PERMS: Permission[] = [
  "billing:read_fees",
  "billing:manage_invoices",
  "patient:read_clinic",
  "appointment:read_clinic"
];

const ADMIN_PERMS: Permission[] = [
  ...RECEPTIONIST_PERMS,
  "staff:read",
  "staff:manage",
  "audit:read",
  "clinic:settings",
  "clinic:switch_org",
  "clinical:read_chart_summary",
  "billing:manage_invoices"
];

/** SUPER_ADMIN inherits admin + explicit org switch (already in admin). */
const SUPER_ADMIN_PERMS: Permission[] = [...ADMIN_PERMS];

export const ROLE_PERMISSIONS: Record<RbacRole, readonly Permission[]> = {
  PATIENT: PATIENT_PERMS,
  RECEPTIONIST: RECEPTIONIST_PERMS,
  DOCTOR: DOCTOR_PERMS,
  NURSE: NURSE_PERMS,
  BILLING: BILLING_PERMS,
  ADMIN: ADMIN_PERMS,
  SUPER_ADMIN: SUPER_ADMIN_PERMS
};

/** Product alias: Clinician → Doctor permissions. */
export function resolveRbacRole(role: string): RbacRole | null {
  if (role === "CLINICIAN") return "DOCTOR";
  if (role in ROLE_PERMISSIONS) return role as RbacRole;
  return null;
}

export function permissionsForRole(role: string): readonly Permission[] {
  const resolved = resolveRbacRole(role);
  if (!resolved) return [];
  return ROLE_PERMISSIONS[resolved];
}

export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
