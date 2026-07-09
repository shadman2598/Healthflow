import { Router } from "express";
import { createReminderSchema, idParamSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManageAppointments } from "../lib/permissions";
import { writeAuditLog } from "../lib/audit";

export const remindersRouter = Router();

remindersRouter.use(requireAuth, enrichAuth);

remindersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.activeOrganizationId;
    const where: Record<string, unknown> = { organizationId: orgId };

    if (req.auth!.role === "PATIENT" && req.auth!.patientProfileId) {
      where.profileId = req.auth!.patientProfileId;
    } else if (!canManageAppointments(req.auth!) && req.auth!.role !== "PATIENT") {
      throw new AppError("Forbidden", 403);
    } else if (req.auth!.role === "PATIENT") {
      throw new AppError("Forbidden", 403);
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        appointment: { include: { patient: true, doctor: true } },
        profile: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ reminders });
  })
);

remindersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);

    const body = createReminderSchema.parse(req.body);
    const orgId = req.auth!.activeOrganizationId;

    const appointment = await prisma.appointment.findFirst({
      where: { id: body.appointmentId, organizationId: orgId },
      include: { profile: true }
    });
    if (!appointment?.profileId) throw new AppError("Appointment not found", 404);

    const reminder = await prisma.reminder.create({
      data: {
        organizationId: orgId,
        appointmentId: body.appointmentId,
        profileId: appointment.profileId,
        offsetMinutes: body.offsetMinutes,
        channel: body.channel,
        dailyUntilAppt: body.dailyUntilAppt
      },
      include: { appointment: true, profile: true }
    });

    await writeAuditLog({
      organizationId: orgId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "REMINDER_CREATED",
      targetType: "Reminder",
      targetId: reminder.id,
      ipAddress: req.ip
    });

    res.status(201).json({ reminder });
  })
);

remindersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);
    const { status } = req.body as { status?: "SCHEDULED" | "SENT" | "FAILED" | "CANCELLED" };

    const existing = await prisma.reminder.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Reminder not found", 404);

    const reminder = await prisma.reminder.update({
      where: { id },
      data: status ? { status } : {},
      include: { appointment: true, profile: true }
    });

    res.json({ reminder });
  })
);
