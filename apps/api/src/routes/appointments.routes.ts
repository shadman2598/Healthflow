import { Router } from "express";
import {
  appointmentsQuerySchema,
  createAppointmentSchema,
  idParamSchema,
  toScheduleSyncRecord,
  updateAppointmentSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManageAppointments } from "../lib/permissions";
import { assertDoctorOwnsAppointment } from "../lib/patient-access";
import { findScheduleConflicts } from "../lib/scheduling";
import { bookAppointmentTransactional } from "../lib/scheduling-engine";
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
