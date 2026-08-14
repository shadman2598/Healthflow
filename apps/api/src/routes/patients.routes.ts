import { Router } from "express";
import { idParamSchema, updatePatientSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManagePatients, isClinicOps } from "../lib/permissions";
import { doctorAccessibleProfilesWhere } from "../lib/patient-access";
import { writeAuditLog } from "../lib/audit";

export const patientsRouter = Router();

patientsRouter.use(requireAuth, enrichAuth);

patientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const orgId = req.auth!.activeOrganizationId;
    const patients = await prisma.patient.findMany({
      where:
        req.auth!.role === "DOCTOR" && req.auth!.doctorProfileId
          ? {
              organizationId: orgId,
              OR: [
                { profile: doctorAccessibleProfilesWhere(req.auth!.doctorProfileId) },
                { appointments: { some: { doctorId: req.auth!.doctorProfileId } } }
              ]
            }
          : { organizationId: orgId },
      orderBy: { createdAt: "desc" }
    });

    res.json({ patients });
  })
);

patientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!isClinicOps(req.auth!)) throw new AppError("Forbidden", 403);

    // Canonical demographics live on PatientProfile — avoid a second entry form.
    throw new AppError(
      "Create patients via POST /patient-profiles (canonical demographics). Legacy POST /patients is disabled to prevent double entry.",
      400,
      { code: "USE_PATIENT_PROFILE", canonical: "PatientProfile" }
    );
  })
);

patientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);

    const patient = await prisma.patient.findFirst({
      where:
        req.auth!.role === "DOCTOR" && req.auth!.doctorProfileId
          ? {
              id,
              organizationId: req.auth!.activeOrganizationId,
              OR: [
                { profile: doctorAccessibleProfilesWhere(req.auth!.doctorProfileId) },
                { appointments: { some: { doctorId: req.auth!.doctorProfileId } } }
              ]
            }
          : { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!patient) throw new AppError("Patient not found", 404);

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_VIEWED",
      targetType: "Patient",
      targetId: id,
      source: "api:/patients",
      ipAddress: req.ip,
      metadata: { legacyRecord: true }
    });

    res.json({ patient });
  })
);

patientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isClinicOps(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);
    const data = updatePatientSchema.parse(req.body);

    const existing = await prisma.patient.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Patient not found", 404);

    const patient = await prisma.patient.update({
      where: { id },
      data
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_UPDATED",
      targetType: "Patient",
      targetId: id,
      source: "api:/patients",
      ipAddress: req.ip,
      metadata: { fields: Object.keys(data), legacyRecord: true }
    });

    res.json({ patient });
  })
);

patientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isClinicOps(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);

    const existing = await prisma.patient.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Patient not found", 404);

    await prisma.patient.delete({ where: { id } });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_DELETED",
      targetType: "Patient",
      targetId: id,
      source: "api:/patients",
      ipAddress: req.ip,
      metadata: { legacyRecord: true }
    });

    res.status(204).send();
  })
);
