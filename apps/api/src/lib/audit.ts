import {
  assertAuditEventComplete,
  categorizeAuditAction,
  isAuditMutationMethod,
  AUDIT_TRAIL_VERSION,
  type AuditEventShape
} from "@technovate/shared";
import type { AuditAction, AuditLog, Prisma, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError } from "../errors/app-error";

export type AuditWriteInput = {
  organizationId: string;
  actorId?: string;
  actorRole?: UserRole;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** e.g. api:/appointments, worker:reminder, system:scheduler */
  source?: string;
  ipAddress?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Append-only audit writer. Application code must never update or delete rows.
 */
export async function writeAuditLog(input: AuditWriteInput): Promise<AuditLog> {
  const source = input.source ?? "api";
  const shape: AuditEventShape = {
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    organizationId: input.organizationId,
    resourceType: input.targetType ?? null,
    resourceId: input.targetId ?? null,
    action: input.action,
    timestamp: new Date().toISOString(),
    source,
    metadata: (input.metadata as Record<string, unknown> | undefined) ?? null
  };

  const check = assertAuditEventComplete(shape);
  if (!check.ok) {
    throw new AppError(`Incomplete audit event: ${check.missing.join(", ")}`, 500);
  }

  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      source,
      ipAddress: input.ipAddress ?? "0.0.0.0",
      metadata: {
        ...(typeof input.metadata === "object" && input.metadata && !Array.isArray(input.metadata)
          ? (input.metadata as Record<string, unknown>)
          : input.metadata
            ? { value: input.metadata }
            : {}),
        auditTrailVersion: AUDIT_TRAIL_VERSION,
        category: categorizeAuditAction(input.action)
      } as Prisma.InputJsonValue
    }
  });
}

/** Refuse any attempt to mutate audit records through application helpers. */
export function assertAuditImmutable(method: string): void {
  if (isAuditMutationMethod(method)) {
    throw new AppError("Audit records are immutable — modifications are not allowed", 405);
  }
}

export async function refuseAuditMutation(_id?: string): Promise<never> {
  throw new AppError("Audit records are immutable — modifications are not allowed", 405);
}

export function serializeAuditLog(log: AuditLog & { actor?: { id: string; email: string; role: UserRole } | null }) {
  return {
    id: log.id,
    organizationId: log.organizationId,
    actorId: log.actorId,
    actorRole: log.actorRole,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    /** Compat with older admin UI field name. */
    entityType: log.targetType,
    entityId: log.targetId,
    source: log.source,
    ipAddress: log.ipAddress,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
    timestamp: log.createdAt.toISOString(),
    category: categorizeAuditAction(log.action),
    actor: log.actor
      ? { id: log.actor.id, email: log.actor.email, role: log.actor.role }
      : null
  };
}

/** Emit blocked prescription/order signal — HealthFlow is not an Rx SoR. */
export async function auditBlockedPrescription(input: {
  organizationId: string;
  actorId?: string;
  actorRole?: UserRole;
  capabilityId: string;
  ipAddress?: string;
  source?: string;
}): Promise<void> {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: "PRESCRIPTION_BLOCKED",
    targetType: "AiCapability",
    targetId: input.capabilityId,
    source: input.source ?? "api:/ai",
    ipAddress: input.ipAddress,
    metadata: {
      reason: "HealthFlow does not prescribe — high-risk clinical capability blocked",
      capabilityId: input.capabilityId
    }
  });
  await writeAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: "CLINICAL_ORDER_ATTEMPTED",
    targetType: "AiCapability",
    targetId: input.capabilityId,
    source: input.source ?? "api:/ai",
    ipAddress: input.ipAddress,
    metadata: { outcome: "blocked", capabilityId: input.capabilityId }
  });
}
