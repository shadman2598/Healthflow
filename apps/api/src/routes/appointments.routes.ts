import { Router } from "express";
import {
  appointmentsQuerySchema,
  createAppointmentSchema,
  idParamSchema,
  pickDaypartSlot,
  simpleAppointmentRequestSchema,
  toScheduleSyncRecord,
  updateAppointmentSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManageAppointments, authHasPermission } from "../lib/permissions";
import { assertDoctorOwnsAppointment } from "../lib/patient-access";
import { findScheduleConflicts } from "../lib/scheduling";
import { bookAppointmentTransactional, listAvailableSlots } from "../lib/scheduling-engine";
import { mergeAppointmentNarratives } from "../lib/data-propagation";
import { writeAuditLog } from "../lib/audit";
import { sanitizeText } from "../lib/sanitize";

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth, enrichAuth);

appointmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = appointmentsQuerySchema.parse(req.query);
    const orgId = req.auth!.activeOrganizationId;

    const baseWhere = {
      organizationId: orgId,
      ...(query.from || query.to
        ? {
            scheduledAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {})
            }
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.profileId ? { profileId: query.profileId } : {})
    };

    const where =
      req.auth!.role === "PATIENT"
        ? { ...baseWhere, profile: { userId: req.auth!.userId } }
        : req.auth!.role === "DOCTOR"
          ? { ...baseWhere, doctorId: req.auth!.doctorProfileId ?? undefined }
          : baseWhere;

    const appointments = await prisma.appointment.findMany({
      where,
      include: { patient: true, profile: true, doctor: true },
      orderBy: { scheduledAt: "asc" }
    });

    res.json({ appointments });
  })
);

appointmentsRouter.post(
  "/simple",
  asyncHandler(async (req, res) => {
    if (!authHasPermission(req.auth!, "appointment:request_own")) {
      throw new AppError("Forbidden", 403);
    }
    if (req.auth!.role !== "PATIENT") throw new AppError("Forbidden", 403);

    const body = simpleAppointmentRequestSchema.parse(req.body);
    const orgId = req.auth!.activeOrganizationId;
    const profileId = req.auth!.patientProfileId;
    if (!profileId) throw new AppError("No patient record on this account", 400);

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { privacyConsentAt: true }
    });
    if (!user?.privacyConsentAt) {
      await prisma.user.update({
        where: { id: req.auth!.userId },
        data: { privacyConsentAt: new Date() }
      });
      await writeAuditLog({
        organizationId: orgId,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "DATA_SHARED",
        targetType: "User",
        targetId: req.auth!.userId,
        ipAddress: req.ip,
        metadata: { event: "data_use_waiver" }
      });
    }

    const profile = await prisma.patientProfile.findFirst({
      where: { id: profileId, organizationId: orgId },
      include: { patientRecord: true, assignedDoctor: true }
    });
    if (!profile) throw new AppError("Patient profile not found", 404);

    let patientId = profile.patientRecord?.id;
    if (!patientId) {
      const created = await prisma.patient.create({
        data: {
          organizationId: orgId,
          profileId: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone
        }
      });
      patientId = created.id;
    }

    const doctors = await prisma.doctorProfile.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" }
    });
    const doctorIds = [
      ...(profile.assignedDoctorId ? [profile.assignedDoctorId] : []),
      ...doctors.map((d) => d.id)
    ].filter((id, i, arr) => arr.indexOf(id) === i);
    if (doctorIds.length === 0) {
      throw new AppError("No doctor is set up at this clinic yet. Please message the clinic.", 503);
    }

    const category =
      body.need === "checkup" ? "CHECKUP" : body.need === "follow_up" ? "FOLLOW_UP" : "OTHER";
    const reason =
      body.need === "other"
        ? sanitizeText(body.needDetail?.trim() || "Other need", 200)
        : body.need === "checkup"
          ? "Checkup"
          : "Follow-up";

    const dayStart = new Date(`${body.day}T00:00:00`);
    if (Number.isNaN(dayStart.getTime()) || dayStart.getTime() < Date.now() - 24 * 3600_000) {
      throw new AppError("Pick a day that is today or later.", 400);
    }

    let chosen: { doctorId: string; startsAt: string } | null = null;
    for (let offset = 0; offset < 14 && !chosen; offset += 1) {
      const from = new Date(dayStart.getTime() + offset * 86400000);
      const to = new Date(from.getTime() + 86400000);
      for (const doctorId of doctorIds) {
        const slots = await listAvailableSlots({
          organizationId: orgId,
          doctorId,
          from,
          to,
          category
        });
        const hit = pickDaypartSlot(slots, body.timeOfDay);
        if (hit) {
          chosen = { doctorId, startsAt: hit.startsAt };
          break;
        }
      }
    }

    if (!chosen) {
      throw new AppError(
        "No open time that day. Try another day, or message the clinic.",
        409
      );
    }

    const { appointment, idempotentReplay } = await bookAppointmentTransactional({
      organizationId: orgId,
      patientId,
      profileId: profile.id,
      doctorId: chosen.doctorId,
      scheduledAt: new Date(chosen.startsAt),
      category,
      reason,
      actorId: req.auth!.userId,
      idempotencyKey: `simple-${req.auth!.userId}-${body.day}-${body.timeOfDay}-${body.need}`
    });

    if (!idempotentReplay) {
      await writeAuditLog({
        organizationId: orgId,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "APPOINTMENT_CREATED",
        targetType: "Appointment",
        targetId: appointment.id,
        ipAddress: req.ip,
        metadata: { simpleRequest: true, need: body.need }
      });
    }

    res.status(idempotentReplay ? 200 : 201).json({
      appointment,
      message: "Your visit is on the calendar. The clinic can see it."
    });
  })
);

appointmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);

    const body = createAppointmentSchema.parse(req.body);
    if (req.auth!.role === "DOCTOR") {
      if (!req.auth!.doctorProfileId || body.doctorId !== req.auth!.doctorProfileId) {
        throw new AppError("Doctors can only book appointments for themselves", 403);
      }
    }

    const idemHeader = req.header("Idempotency-Key") ?? body.idempotencyKey;
    const { appointment, idempotentReplay } = await bookAppointmentTransactional({
      organizationId: req.auth!.activeOrganizationId,
      patientId: body.patientId,
      profileId: body.profileId,
      doctorId: body.doctorId,
      scheduledAt: new Date(body.scheduledAt),
      category: body.category,
      durationMinutes: body.durationMinutes,
      bufferBeforeMinutes: body.bufferBeforeMinutes,
      bufferAfterMinutes: body.bufferAfterMinutes,
      location: body.location,
      allowDoubleBook: body.allowDoubleBook,
      reason: body.reason,
      patientNotes: body.patientNotes,
      staffNotes: body.staffNotes,
      externalSyncId: body.externalSyncId,
      idempotencyKey: idemHeader,
      actorId: req.auth!.userId,
      bypassAvailability: body.bypassAvailability ?? true
    });

    if (!idempotentReplay) {
      await writeAuditLog({
        organizationId: req.auth!.activeOrganizationId,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "APPOINTMENT_CREATED",
        targetType: "Appointment",
        targetId: appointment.id,
        ipAddress: req.ip,
        metadata: {
          scheduledAt: appointment.scheduledAt,
          doctorId: appointment.doctorId,
          category: appointment.category,
          location: appointment.location
        }
      });
    }

    res.status(idempotentReplay ? 200 : 201).json({
      appointment,
      sync: toScheduleSyncRecord("Appointment", appointment.id, appointment.updatedAt, {
        doctorId: appointment.doctorId,
        scheduledAt: appointment.scheduledAt.toISOString(),
        status: appointment.status,
        externalSyncId: appointment.externalSyncId
      }),
      idempotentReplay
    });
  })
);

appointmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: { patient: true, profile: true, doctor: true, reminders: true, reminderLogs: true }
    });
    if (!appointment) throw new AppError("Appointment not found", 404);

    if (req.auth!.role === "PATIENT" && appointment.profile?.userId !== req.auth!.userId) {
      throw new AppError("Forbidden", 403);
    }
    await assertDoctorOwnsAppointment(req.auth!, appointment);

    res.json({ appointment });
  })
);

appointmentsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateAppointmentSchema.parse(req.body);

    const existing = await prisma.appointment.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: { profile: true }
    });
    if (!existing) throw new AppError("Appointment not found", 404);

    if (req.auth!.role === "PATIENT") {
      if (existing.profile?.userId !== req.auth!.userId) throw new AppError("Forbidden", 403);
      if (body.status && !["CONFIRMED", "CANCELLED", "RESCHEDULE_REQUESTED"].includes(body.status)) {
        throw new AppError("Patients can only confirm, cancel, or request reschedule", 403);
      }

      const narrative = mergeAppointmentNarratives({
        appointmentId: id,
        actorRole: "PATIENT",
        existingReason: existing.reason,
        existingPatientNotes: existing.patientNotes,
        existingStaffNotes: existing.staffNotes,
        proposedPatientNotes: body.patientNotes,
        // Patients may freely edit their own notes (overwrite allowed for self).
        allowOverwritePatientNotes: true
      });

      const appointment = await prisma.appointment.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(narrative.patientNotes !== undefined ? { patientNotes: narrative.patientNotes } : {})
        },
        include: { patient: true, doctor: true, profile: true }
      });

      await writeAuditLog({
        organizationId: req.auth!.activeOrganizationId,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "APPOINTMENT_UPDATED",
        targetType: "Appointment",
        targetId: id,
        ipAddress: req.ip,
        metadata: { status: body.status, provenance: narrative.provenance }
      });

      res.json({ appointment });
      return;
    } else if (!canManageAppointments(req.auth!)) {
      throw new AppError("Forbidden", 403);
    }

    await assertDoctorOwnsAppointment(req.auth!, existing);
    if (req.auth!.role === "DOCTOR" && body.doctorId && body.doctorId !== req.auth!.doctorProfileId) {
      throw new AppError("Doctors cannot reassign appointments to other clinicians", 403);
    }

    const nextDoctorId = body.doctorId !== undefined ? body.doctorId : existing.doctorId;
    const nextScheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : existing.scheduledAt;
    const nextDuration = body.durationMinutes ?? existing.durationMinutes ?? 30;

    if (body.scheduledAt || body.doctorId !== undefined || body.durationMinutes) {
      const conflicts = await findScheduleConflicts({
        organizationId: req.auth!.activeOrganizationId,
        doctorId: nextDoctorId,
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDuration,
        excludeAppointmentId: id
      });
      if (conflicts.length > 0) {
        throw new AppError(
          "Scheduling conflict: that clinician already has an overlapping appointment",
          409
        );
      }
    }

    // Confirm ≠ check-in: only set arrival time when the desk explicitly sends checkedInAt.
    const checkIn =
      body.checkedInAt !== undefined
        ? body.checkedInAt
          ? new Date(body.checkedInAt)
          : null
        : undefined;

    const narrative = mergeAppointmentNarratives({
      appointmentId: id,
      actorRole: req.auth!.role,
      existingReason: existing.reason,
      existingPatientNotes: existing.patientNotes,
      existingStaffNotes: existing.staffNotes,
      proposedReason: body.reason,
      proposedPatientNotes: body.patientNotes,
      proposedStaffNotes: body.staffNotes,
      allowOverwriteReason: body.allowOverwriteReason,
      allowOverwritePatientNotes: body.allowOverwritePatientNotes
    });

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(body.patientId ? { patientId: body.patientId } : {}),
        ...(body.doctorId !== undefined ? { doctorId: body.doctorId } : {}),
        ...(body.scheduledAt ? { scheduledAt: new Date(body.scheduledAt) } : {}),
        ...(body.durationMinutes ? { durationMinutes: body.durationMinutes } : {}),
        ...(narrative.reason !== undefined ? { reason: narrative.reason } : {}),
        ...(narrative.patientNotes !== undefined ? { patientNotes: narrative.patientNotes } : {}),
        ...(narrative.staffNotes !== undefined
          ? { staffNotes: narrative.staffNotes ? sanitizeText(narrative.staffNotes) : narrative.staffNotes }
          : {}),
        ...(body.category ? { category: body.category } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(checkIn !== undefined ? { checkedInAt: checkIn } : {})
      },
      include: { patient: true, doctor: true, profile: true }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "APPOINTMENT_UPDATED",
      targetType: "Appointment",
      targetId: id,
      ipAddress: req.ip,
      metadata: {
        status: body.status,
        checkedIn: Boolean(checkIn),
        provenance: narrative.provenance,
        overwriteFlags: {
          reason: Boolean(body.allowOverwriteReason),
          patientNotes: Boolean(body.allowOverwritePatientNotes)
        }
      }
    });

    res.json({ appointment });
  })
);

appointmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManageAppointments(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.appointment.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Appointment not found", 404);
    await assertDoctorOwnsAppointment(req.auth!, existing);

    await prisma.appointment.delete({ where: { id } });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "APPOINTMENT_DELETED",
      targetType: "Appointment",
      targetId: id,
      ipAddress: req.ip
    });

    res.status(204).send();
  })
);
