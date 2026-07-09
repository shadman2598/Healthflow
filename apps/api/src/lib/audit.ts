import type { AuditAction, Prisma, UserRole } from "@prisma/client";
import { prisma } from "./prisma";

type AuditInput = {
  organizationId: string;
  actorId?: string;
  actorRole?: UserRole;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: input.ipAddress ?? "0.0.0.0",
      metadata: input.metadata ?? undefined
    }
  });
}
