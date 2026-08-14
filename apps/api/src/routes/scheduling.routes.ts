import { Router } from "express";
import {
  createAvailabilitySchema,
  createScheduleBlockSchema,
  createWaitlistSchema,
  idParamSchema,
  schedulingSlotsQuerySchema,
  toScheduleSyncRecord
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManageAppointments } from "../lib/permissions";
import { writeAuditLog } from "../lib/audit";
import { listAvailableSlots, matchWaitlistForSlot } from "../lib/scheduling-engine";

export const schedulingRouter = Router();

schedulingRouter.use(requireAuth, enrichAuth);

schedulingRouter.get(
  "/slots",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const query = schedulingSlotsQuerySchema.parse(req.query);
    const slots = await listAvailableSlots({
      organizationId: req.auth!.activeOrganizationId,
      doctorId: query.doctorId,
      from: new Date(query.from),
      to: new Date(query.to),
      category: query.category,
      durationMinutes: query.durationMinutes,
      location: query.location
    });
    res.json({ slots });
  })
);

schedulingRouter.get(
  "/availability",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;
    const rows = await prisma.providerAvailability.findMany({
      where: {
        organizationId: req.auth!.activeOrganizationId,
        ...(doctorId ? { doctorId } : {})
      },
      orderBy: [{ doctorId: "asc" }, { dayOfWeek: "asc" }, { startMinute: "asc" }]
    });
    res.json({
      availability: rows.map((r) =>
        toScheduleSyncRecord("ScheduleBlock", r.id, r.updatedAt, {
          doctorId: r.doctorId,
          dayOfWeek: r.dayOfWeek,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          location: r.location,
          bufferBeforeMinutes: r.bufferBeforeMinutes,
          bufferAfterMinutes: r.bufferAfterMinutes,
          allowDoubleBook: r.allowDoubleBook
        })
      )
    });
  })
);

schedulingRouter.post(
  "/availability",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const body = createAvailabilitySchema.parse(req.body);
    if (body.endMinute <= body.startMinute) {
      throw new AppError("endMinute must be after startMinute", 400);
    }
    if (req.auth!.role === "DOCTOR" && body.doctorId !== req.auth!.doctorProfileId) {
      throw new AppError("Doctors can only manage their own availability", 403);
    }

    const row = await prisma.providerAvailability.create({
      data: {
        organizationId: req.auth!.activeOrganizationId,
        ...body
      }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "SCHEDULE_UPDATED",
      targetType: "ProviderAvailability",
      targetId: row.id,
      source: "api:/scheduling/availability",
      ipAddress: req.ip,
      metadata: { event: "availability_created" }
    });

    res.status(201).json({ availability: row });
  })
);

schedulingRouter.post(
  "/blocks",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const body = createScheduleBlockSchema.parse(req.body);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) throw new AppError("Block end must be after start", 400);

    const row = await prisma.scheduleBlock.create({
      data: {
        organizationId: req.auth!.activeOrganizationId,
        doctorId: body.doctorId,
        startsAt,
        endsAt,
        location: body.location,
        reason: body.reason
      }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "SCHEDULE_UPDATED",
      targetType: "ScheduleBlock",
      targetId: row.id,
      source: "api:/scheduling/blocks",
      ipAddress: req.ip,
      metadata: { event: "block_created" }
    });

    res.status(201).json({
      block: toScheduleSyncRecord("ScheduleBlock", row.id, row.createdAt, {
        doctorId: row.doctorId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        location: row.location,
        reason: row.reason
      })
    });
  })
);

schedulingRouter.get(
  "/waitlist",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const rows = await prisma.waitlistEntry.findMany({
      where: {
        organizationId: req.auth!.activeOrganizationId,
        status: "OPEN"
      },
      include: { profile: true, doctor: true },
      orderBy: { createdAt: "asc" }
    });
    res.json({
      waitlist: rows.map((r) =>
        toScheduleSyncRecord("WaitlistEntry", r.id, r.updatedAt, {
          profileId: r.profileId,
          doctorId: r.doctorId,
          category: r.category,
          preferredFrom: r.preferredFrom.toISOString(),
          preferredTo: r.preferredTo.toISOString(),
          status: r.status,
          patientName: `${r.profile.firstName} ${r.profile.lastName}`
        })
      )
    });
  })
);

schedulingRouter.post(
  "/waitlist",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const body = createWaitlistSchema.parse(req.body);
    const preferredFrom = new Date(body.preferredFrom);
    const preferredTo = new Date(body.preferredTo);
    if (preferredTo <= preferredFrom) throw new AppError("preferredTo must be after preferredFrom", 400);

    const profile = await prisma.patientProfile.findFirst({
      where: { id: body.profileId, organizationId: req.auth!.activeOrganizationId }
    });
    if (!profile) throw new AppError("Patient profile not found", 404);

    const row = await prisma.waitlistEntry.create({
      data: {
        organizationId: req.auth!.activeOrganizationId,
        profileId: body.profileId,
        doctorId: body.doctorId,
        category: body.category,
        preferredFrom,
        preferredTo,
        notes: body.notes
      }
    });

    res.status(201).json({
      entry: toScheduleSyncRecord("WaitlistEntry", row.id, row.updatedAt, {
        ...body,
        status: row.status
      })
    });
  })
);

schedulingRouter.get(
  "/waitlist/match",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const doctorId = String(req.query.doctorId ?? "");
    const startsAt = String(req.query.startsAt ?? "");
    if (!doctorId || !startsAt) throw new AppError("doctorId and startsAt required", 400);
    const matches = await matchWaitlistForSlot({
      organizationId: req.auth!.activeOrganizationId,
      doctorId,
      startsAt: new Date(startsAt),
      category: typeof req.query.category === "string" ? (req.query.category as never) : undefined
    });
    res.json({ matches });
  })
);

schedulingRouter.get(
  "/sync",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const since = typeof req.query.since === "string" ? new Date(req.query.since) : new Date(0);
    const orgId = req.auth!.activeOrganizationId;

    const [appointments, blocks] = await Promise.all([
      prisma.appointment.findMany({
        where: { organizationId: orgId, updatedAt: { gt: since } },
        orderBy: { updatedAt: "asc" },
        take: 200
      }),
      prisma.scheduleBlock.findMany({
        where: { organizationId: orgId, createdAt: { gt: since } },
        orderBy: { createdAt: "asc" },
        take: 100
      })
    ]);

    res.json({
      records: [
        ...appointments.map((a) =>
          toScheduleSyncRecord("Appointment", a.id, a.updatedAt, {
            doctorId: a.doctorId,
            profileId: a.profileId,
            scheduledAt: a.scheduledAt.toISOString(),
            durationMinutes: a.durationMinutes,
            status: a.status,
            category: a.category,
            location: a.location,
            externalSyncId: a.externalSyncId,
            bufferBeforeMinutes: a.bufferBeforeMinutes,
            bufferAfterMinutes: a.bufferAfterMinutes
          })
        ),
        ...blocks.map((b) =>
          toScheduleSyncRecord("ScheduleBlock", b.id, b.createdAt, {
            doctorId: b.doctorId,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            location: b.location,
            reason: b.reason
          })
        )
      ]
    });
  })
);

schedulingRouter.delete(
  "/availability/:id",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.providerAvailability.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Availability not found", 404);
    await prisma.providerAvailability.delete({ where: { id } });
    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "SCHEDULE_UPDATED",
      targetType: "ProviderAvailability",
      targetId: id,
      source: "api:/scheduling/availability",
      ipAddress: req.ip,
      metadata: { change: "deleted" }
    });
    res.status(204).end();
  })
);
