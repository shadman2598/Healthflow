import { Router } from "express";
import { reminderLogsQuerySchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";

export const reminderLogsRouter = Router();

reminderLogsRouter.use(requireAuth);

reminderLogsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = reminderLogsQuerySchema.parse(req.query);

    const logs = await prisma.reminderLog.findMany({
      where: {
        organizationId: req.auth!.activeOrganizationId,
        ...(query.appointmentId ? { appointmentId: query.appointmentId } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {})
      },
      include: {
        appointment: true,
        patient: true,
        rule: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ logs });
  })
);
