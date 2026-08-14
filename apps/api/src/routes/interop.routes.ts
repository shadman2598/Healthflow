import { Router } from "express";
import { idParamSchema, toFhirAppointment, toFhirPatient } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { assertCanViewPatientProfile } from "../lib/patient-access";
import { writeAuditLog } from "../lib/audit";

export const interopRouter = Router();

interopRouter.use(requireAuth, enrichAuth);

interopRouter.get(
  "/fhir/Patient/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await assertCanViewPatientProfile(req.auth!, id);

    const profile = await prisma.patientProfile.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!profile) throw new AppError("Patient not found", 404);

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_EXPORTED",
      targetType: "PatientProfile",
      targetId: id,
      ipAddress: req.ip,
      metadata: { format: "fhir-r4", resource: "Patient" }
    });

    res.json({
      resource: toFhirPatient({
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
        healthcareNumber: profile.healthcareNumber,
        dateOfBirth: profile.dateOfBirth,
        organizationId: profile.organizationId
      })
    });
  })
);

interopRouter.get(
  "/fhir/Appointment/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: { profile: true, doctor: true, patient: true }
    });
    if (!appointment) throw new AppError("Appointment not found", 404);

    if (req.auth!.role === "PATIENT") {
      if (!appointment.profileId || appointment.profile?.userId !== req.auth!.userId) {
        throw new AppError("Forbidden", 403);
      }
    } else if (req.auth!.role === "DOCTOR") {
      if (appointment.doctorId !== req.auth!.doctorProfileId) {
        throw new AppError("Forbidden", 403);
      }
    }

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_EXPORTED",
      targetType: "Appointment",
      targetId: id,
      ipAddress: req.ip,
      metadata: { format: "fhir-r4", resource: "Appointment" }
    });

    res.json({
      resource: toFhirAppointment({
        id: appointment.id,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        reason: appointment.reason,
        profileId: appointment.profileId,
        doctorId: appointment.doctorId,
        patientName: appointment.profile
          ? `${appointment.profile.firstName} ${appointment.profile.lastName}`
          : `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName: appointment.doctor
          ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
          : undefined,
        organizationId: appointment.organizationId
      })
    });
  })
);
