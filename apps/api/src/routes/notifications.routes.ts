import { Router } from "express";
import { idParamSchema, notificationEngagementSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import {
  loadEngagementStats,
  recordNotificationEngagement,
  retryFailedNotification
} from "../lib/notification-intelligence";
import { canManageAppointments } from "../lib/permissions";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth, enrichAuth);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.activeOrganizationId;
    const where: Record<string, unknown> = {
      organizationId: orgId,
      status: { not: "SUPPRESSED" }
    };

    if (req.auth!.role === "PATIENT") {
      if (!req.auth!.patientProfileId) throw new AppError("Forbidden", 403);
      where.profileId = req.auth!.patientProfileId;
    } else if (!canManageAppointments(req.auth!)) {
      throw new AppError("Forbidden", 403);
    }

    const notifications = await prisma.notificationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const stats =
      req.auth!.role === "PATIENT" && req.auth!.patientProfileId
        ? await loadEngagementStats(req.auth!.patientProfileId)
        : null;

    res.json({ notifications, engagementStats: stats });
  })
);

notificationsRouter.post(
  "/:id/engagement",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { engagement } = notificationEngagementSchema.parse(req.body);

    const event = await prisma.notificationEvent.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!event) throw new AppError("Notification not found", 404);

    if (req.auth!.role === "PATIENT") {
      if (!req.auth!.patientProfileId || event.profileId !== req.auth!.patientProfileId) {
        throw new AppError("Forbidden", 403);
      }
    } else if (!canManageAppointments(req.auth!)) {
      throw new AppError("Forbidden", 403);
    }

    const updated = await recordNotificationEngagement(id, engagement);
    res.json({ notification: updated });
  })
);

notificationsRouter.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const { id } = idParamSchema.parse(req.params);
    const event = await prisma.notificationEvent.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!event) throw new AppError("Notification not found", 404);

    const ok = await retryFailedNotification(id);
    if (!ok) throw new AppError("Retry not available", 400);
    res.json({ ok: true });
  })
);
