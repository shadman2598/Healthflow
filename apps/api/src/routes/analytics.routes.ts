import { Router } from "express";
import { analyticsEventSchema, isAnalyticsEventName } from "@technovate/shared";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { writeAuditLog } from "../lib/audit";
import { AppError } from "../errors/app-error";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const body = analyticsEventSchema.parse(req.body);
    if (!isAnalyticsEventName(body.name)) {
      throw new AppError("Unknown analytics event", 400);
    }

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "ANALYTICS_EVENT",
      targetType: body.resourceType ?? "Analytics",
      targetId: body.resourceId,
      ipAddress: req.ip,
      metadata: { name: body.name, ...(body.metadata ?? {}) }
    });

    res.status(202).json({ ok: true });
  })
);
