/**
 * Immutable audit trail catalog (Prompt 43).
 * Policy + coverage contracts — writers live in the API.
 *
 * Users must not modify audit records through normal application APIs.
 * HealthFlow does not own a prescribing SoR; clinical-order actions exist for
 * blocked/attempted workflow signals only.
 */

export const AUDIT_TRAIL_VERSION = "hf-audit-v1";

export type AuditCategory =
  | "authentication"
  | "record_access"
  | "record_modification"
  | "record_deletion"
  | "permission_change"
  | "data_export"
  | "data_sharing"
  | "ai"
  | "clinical_order"
  | "appointment"
  | "administrative";

/** Canonical action names — keep in sync with Prisma AuditAction. */
export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "PATIENT_VIEWED",
  "PATIENT_CREATED",
  "PATIENT_UPDATED",
  "PATIENT_DELETED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_UPDATED",
  "APPOINTMENT_DELETED",
  "MESSAGE_SENT",
  "MESSAGE_READ",
  "REMINDER_CREATED",
  "REMINDER_SENT",
  "ROLE_CHANGED",
  "PERMISSION_CHANGED",
  "HEALTHCARE_NUMBER_REVEALED",
  "STAFF_INVITE_USED",
  "STAFF_INVITE_CREATED",
  "STAFF_CREATED",
  "DATA_EXPORTED",
  "DATA_SHARED",
  "ANALYTICS_EVENT",
  "AI_GENERATED",
  "AI_REVIEWED",
  "AI_BLOCKED",
  "AI_FAILED",
  "NEXT_ACTION_DISMISSED",
  "NEXT_ACTION_RESTORED",
  "NEXT_ACTION_COMPLETED",
  "CLINICAL_ORDER_ATTEMPTED",
  "PRESCRIPTION_BLOCKED",
  "ADMIN_ACTION",
  "SCHEDULE_UPDATED"
] as const;

export type AuditActionName = (typeof AUDIT_ACTIONS)[number];

export type AuditCoverageRequirement = {
  category: AuditCategory;
  label: string;
  requiredActions: AuditActionName[];
  /** When true, action may be emitted only on blocked/attempted paths (no SoR). */
  workflowOnly?: boolean;
};

/**
 * Prompt 43 required coverage map — every sensitive class must map to ≥1 action.
 */
export const AUDIT_COVERAGE_REQUIREMENTS: AuditCoverageRequirement[] = [
  {
    category: "authentication",
    label: "login / logout",
    requiredActions: ["LOGIN", "LOGOUT"]
  },
  {
    category: "record_access",
    label: "record access",
    requiredActions: ["PATIENT_VIEWED", "MESSAGE_READ", "HEALTHCARE_NUMBER_REVEALED"]
  },
  {
    category: "record_modification",
    label: "record modification",
    requiredActions: ["PATIENT_UPDATED", "PATIENT_CREATED", "APPOINTMENT_UPDATED", "SCHEDULE_UPDATED"]
  },
  {
    category: "record_deletion",
    label: "record deletion",
    requiredActions: ["PATIENT_DELETED", "APPOINTMENT_DELETED"]
  },
  {
    category: "permission_change",
    label: "permission / role changes",
    requiredActions: ["ROLE_CHANGED", "PERMISSION_CHANGED", "STAFF_CREATED"]
  },
  {
    category: "data_export",
    label: "data export",
    requiredActions: ["DATA_EXPORTED"]
  },
  {
    category: "data_sharing",
    label: "data sharing",
    requiredActions: ["DATA_SHARED"]
  },
  {
    category: "ai",
    label: "AI-generated content and review",
    requiredActions: ["AI_GENERATED", "AI_REVIEWED", "AI_BLOCKED", "AI_FAILED"]
  },
  {
    category: "clinical_order",
    label: "prescriptions / orders (blocked — no HealthFlow Rx SoR)",
    requiredActions: ["CLINICAL_ORDER_ATTEMPTED", "PRESCRIPTION_BLOCKED"],
    workflowOnly: true
  },
  {
    category: "appointment",
    label: "appointment changes",
    requiredActions: ["APPOINTMENT_CREATED", "APPOINTMENT_UPDATED", "APPOINTMENT_DELETED"]
  },
  {
    category: "administrative",
    label: "administrative actions",
    requiredActions: ["ADMIN_ACTION", "STAFF_INVITE_CREATED", "STAFF_INVITE_USED", "ANALYTICS_EVENT"]
  }
];

export type AuditEventShape = {
  actorId?: string | null;
  actorRole?: string | null;
  organizationId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  action: string;
  timestamp: string;
  source: string;
  metadata?: Record<string, unknown> | null;
};

/** HTTP methods that must never mutate audit records via application APIs. */
export const AUDIT_FORBIDDEN_HTTP_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export function categorizeAuditAction(action: string): AuditCategory | null {
  for (const req of AUDIT_COVERAGE_REQUIREMENTS) {
    if ((req.requiredActions as readonly string[]).includes(action)) return req.category;
  }
  if (action.startsWith("AI_")) return "ai";
  if (action.startsWith("NEXT_ACTION_")) return "administrative";
  if (action.startsWith("REMINDER_")) return "administrative";
  return null;
}

export function assertAuditCoverageComplete(
  knownActions: readonly string[] = AUDIT_ACTIONS
): { ok: true } | { ok: false; missing: string[] } {
  const set = new Set(knownActions);
  const missing: string[] = [];
  for (const req of AUDIT_COVERAGE_REQUIREMENTS) {
    for (const action of req.requiredActions) {
      if (!set.has(action)) missing.push(`${req.category}:${action}`);
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

export function assertAuditEventComplete(event: Partial<AuditEventShape>): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!event.organizationId) missing.push("organizationId");
  if (!event.action) missing.push("action");
  if (!event.timestamp) missing.push("timestamp");
  if (!event.source) missing.push("source");
  // Actor may be null for system jobs; role should accompany actor when present.
  if (event.actorId && !event.actorRole) missing.push("actorRole");
  return { ok: missing.length === 0, missing };
}

export function isAuditMutationMethod(method: string): boolean {
  return (AUDIT_FORBIDDEN_HTTP_METHODS as readonly string[]).includes(method.toUpperCase());
}
