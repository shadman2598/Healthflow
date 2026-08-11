import { Router } from "express";
import { createPatientSchema, idParamSchema, updatePatientSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManagePatients } from "../lib/permissions";

export const patientsRouter = Router();

patientsRouter.use(requireAuth, enrichAuth);

patientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const patients = await prisma.patient.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      orderBy: { createdAt: "desc" }
    });

    res.json({ patients });
  })
);

patientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const body = createPatientSchema.parse(req.body);

    const patient = await prisma.patient.create({
      data: {
        ...body,
        organizationId: req.auth!.activeOrganizationId
      }
    });
    res.status(201).json({ patient });
  })
);

patientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);

    const patient = await prisma.patient.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!patient) throw new AppError("Patient not found", 404);

    res.json({ patient });
  })
);

patientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

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
    res.json({ patient });
  })
);

patientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const { id } = idParamSchema.parse(req.params);

    const existing = await prisma.patient.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Patient not found", 404);

    await prisma.patient.delete({ where: { id } });
    res.status(204).send();
  })
);
