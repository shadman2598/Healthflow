import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { requirePermissions } from "../middleware/require-permission";
import { refuseAuditMutation, serializeAuditLog } from "../lib/audit";
import { AUDIT_COVERAGE_REQUIREMENTS, AUDIT_TRAIL_VERSION } from "@technovate/shared";

export const auditRouter = Router();

auditRouter.use(requireAuth, requirePermissions("audit:read"));

const querySchema = z.object({
  action: z.string().optional(),
  targetType: z.string().optional(),
  actorId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).optional()
});

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = querySchema.parse(req.query);
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: req.auth!.activeOrganizationId,
        ...(q.action ? { action: q.action as never } : {}),
        ...(q.targetType ? { targetType: q.targetType } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {})
      },
      include: { actor: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: q.take ?? 100
    });

    res.json({
      logs: logs.map(serializeAuditLog),
      immutable: true,
      auditTrailVersion: AUDIT_TRAIL_VERSION,
      coverage: AUDIT_COVERAGE_REQUIREMENTS.map((c) => ({
        category: c.category,
        label: c.label,
        actions: c.requiredActions,
        workflowOnly: c.workflowOnly ?? false
      }))
    });
  })
);

auditRouter.get(
  "/coverage",
  asyncHandler(async (_req, res) => {
    res.json({
      immutable: true,
      auditTrailVersion: AUDIT_TRAIL_VERSION,
      requirements: AUDIT_COVERAGE_REQUIREMENTS
    });
  })
);

/** Explicit immutability: no create/update/delete via application APIs. */
auditRouter.post(
  "/",
  asyncHandler(async () => {
    refuseAuditMutation();
  })
);
auditRouter.put(
  "/",
  asyncHandler(async () => {
    refuseAuditMutation();
  })
);
auditRouter.patch(
  "/",
  asyncHandler(async () => {
    refuseAuditMutation();
  })
);
auditRouter.delete(
  "/",
  asyncHandler(async () => {
    refuseAuditMutation();
  })
);
auditRouter.put(
  "/:id",
  asyncHandler(async (req) => {
    await refuseAuditMutation(req.params.id);
  })
);
auditRouter.patch(
  "/:id",
  asyncHandler(async (req) => {
    await refuseAuditMutation(req.params.id);
  })
);
auditRouter.delete(
  "/:id",
  asyncHandler(async (req) => {
    await refuseAuditMutation(req.params.id);
  })
);
