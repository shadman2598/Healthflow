import { Router } from "express";
import {
  createPatientProfileSchema,
  idParamSchema,
  patientsQuerySchema,
  updatePatientProfileSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManagePatients, canViewPatient } from "../lib/permissions";
import { maskHealthcareNumber, sanitizeText } from "../lib/sanitize";
import { writeAuditLog } from "../lib/audit";

import { rateLimit } from "../middleware/rate-limit";

export const patientProfilesRouter = Router();

const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, keyPrefix: "patient-search" });

patientProfilesRouter.use(requireAuth, enrichAuth);

patientProfilesRouter.get(
  "/overdue/checkups",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const orgId = req.auth!.activeOrganizationId;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);

    const profiles = await prisma.patientProfile.findMany({
      where: { organizationId: orgId },
      include: {
        appointments: {
          where: { status: "COMPLETED" },
          orderBy: { scheduledAt: "desc" },
          take: 1
        }
      }
    });

    const overdue = profiles
      .map((p) => {
        const last = p.appointments[0];
        const lastDate = last?.scheduledAt ?? p.createdAt;
        const daysOverdue = Math.floor((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000)) - 365;
        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          lastCheckupDate: lastDate,
          daysOverdue: Math.max(0, daysOverdue),
          isOverdue: lastDate < cutoff
        };
      })
      .filter((p) => p.isOverdue)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.json({ overdue });
  })
);

patientProfilesRouter.get(
  "/",
  searchLimiter,
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!) && req.auth!.role !== "PATIENT") {
      throw new AppError("Forbidden", 403);
    }

    const query = patientsQuerySchema.parse(req.query);
    const orgId = req.auth!.activeOrganizationId;

    if (req.auth!.role === "PATIENT") {
      const profile = await prisma.patientProfile.findFirst({
        where: { userId: req.auth!.userId, organizationId: orgId },
        include: {
          assignedDoctor: true,
          appointments: { orderBy: { scheduledAt: "desc" }, take: 5 }
        }
      });
      res.json({ profiles: profile ? [profile] : [] });
      return;
    }

    const where = {
      organizationId: orgId,
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" as const } },
              { lastName: { contains: query.q, mode: "insensitive" as const } },
              { email: { contains: query.q, mode: "insensitive" as const } },
              { phone: { contains: query.q } },
              { healthcareNumber: { contains: query.q } }
            ]
          }
        : {})
    };

    const profiles = await prisma.patientProfile.findMany({
      where,
      include: {
        assignedDoctor: true,
        appointments: { orderBy: { scheduledAt: "desc" } },
        _count: { select: { appointments: true } }
      },
      orderBy:
        query.sort === "name"
          ? [{ lastName: "asc" }, { firstName: "asc" }]
          : query.sort === "newest"
            ? { createdAt: "desc" }
            : { createdAt: "desc" }
    });

    const now = Date.now();
    let mapped = profiles.map((p) => {
      const lastPast = p.appointments.find(
        (a) => new Date(a.scheduledAt).getTime() <= now || a.status === "COMPLETED"
      );
      const nextFuture = [...p.appointments]
        .filter(
          (a) =>
            new Date(a.scheduledAt).getTime() > now &&
            !["CANCELLED", "MISSED"].includes(a.status)
        )
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

      return {
        ...p,
        healthcareNumber: maskHealthcareNumber(p.healthcareNumber),
        totalVisits: p._count.appointments,
        lastAppointmentDate: lastPast?.scheduledAt ?? null,
        nextAppointmentDate: nextFuture?.scheduledAt ?? null
      };
    });

    if (query.sort === "visits") {
      mapped = mapped.sort((a, b) => (b.totalVisits ?? 0) - (a.totalVisits ?? 0));
    } else if (query.sort === "recent") {
      mapped = mapped.sort((a, b) => {
        const aT = a.lastAppointmentDate ? new Date(a.lastAppointmentDate).getTime() : 0;
        const bT = b.lastAppointmentDate ? new Date(b.lastAppointmentDate).getTime() : 0;
        return bT - aT;
      });
    } else if (query.sort === "upcoming") {
      mapped = mapped.sort((a, b) => {
        const aT = a.nextAppointmentDate ? new Date(a.nextAppointmentDate).getTime() : Infinity;
        const bT = b.nextAppointmentDate ? new Date(b.nextAppointmentDate).getTime() : Infinity;
        return aT - bT;
      });
    }

    res.json({ profiles: mapped });
  })
);

patientProfilesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const body = createPatientProfileSchema.parse(req.body);
    const orgId = req.auth!.activeOrganizationId;

    const dup = await prisma.patientProfile.findFirst({
      where: { organizationId: orgId, healthcareNumber: body.healthcareNumber }
    });
    if (dup) throw new AppError("Healthcare number already exists", 409);

    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.patientProfile.create({
        data: {
          organizationId: orgId,
          firstName: sanitizeText(body.firstName, 100),
          lastName: sanitizeText(body.lastName, 100),
          email: body.email,
          phone: body.phone,
          healthcareNumber: body.healthcareNumber,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
          heightCm: body.heightCm,
          weightKg: body.weightKg,
          address: body.address ? sanitizeText(body.address, 300) : undefined,
          internalNotes: body.internalNotes ? sanitizeText(body.internalNotes) : undefined,
          assignedDoctorId: body.assignedDoctorId,
          isRegularPatient: body.isRegularPatient ?? false
        }
      });

      await tx.patient.create({
        data: {
          organizationId: orgId,
          profileId: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          email: created.email,
          phone: created.phone
        }
      });

      return created;
    });

    await writeAuditLog({
      organizationId: orgId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_CREATED",
      targetType: "PatientProfile",
      targetId: profile.id,
      ipAddress: req.ip
    });

    res.status(201).json({
      profile: { ...profile, healthcareNumber: maskHealthcareNumber(profile.healthcareNumber) }
    });
  })
);

patientProfilesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    if (!canViewPatient(req.auth!, id)) throw new AppError("Forbidden", 403);

    const profile = await prisma.patientProfile.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: {
        assignedDoctor: true,
        appointments: { orderBy: { scheduledAt: "desc" }, take: 20 },
        messageThreads: { orderBy: { updatedAt: "desc" }, take: 5 }
      }
    });
    if (!profile) throw new AppError("Patient not found", 404);

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_VIEWED",
      targetType: "PatientProfile",
      targetId: id,
      ipAddress: req.ip
    });

    const isStaff = req.auth!.role !== "PATIENT";
    res.json({
      profile: {
        ...profile,
        healthcareNumber: maskHealthcareNumber(profile.healthcareNumber),
        internalNotes: isStaff ? profile.internalNotes : undefined
      }
    });
  })
);

patientProfilesRouter.post(
  "/:id/reveal-hcn",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const profile = await prisma.patientProfile.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!profile) throw new AppError("Patient not found", 404);

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "HEALTHCARE_NUMBER_REVEALED",
      targetType: "PatientProfile",
      targetId: id,
      ipAddress: req.ip
    });

    res.json({ healthcareNumber: profile.healthcareNumber });
  })
);

patientProfilesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    if (!canManagePatients(req.auth!)) throw new AppError("Forbidden", 403);

    const data = updatePatientProfileSchema.parse(req.body);
    const existing = await prisma.patientProfile.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Patient not found", 404);

    const profile = await prisma.patientProfile.update({
      where: { id },
      data: {
        ...data,
        firstName: data.firstName ? sanitizeText(data.firstName, 100) : undefined,
        lastName: data.lastName ? sanitizeText(data.lastName, 100) : undefined,
        internalNotes: data.internalNotes ? sanitizeText(data.internalNotes) : undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined
      }
    });

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "PATIENT_UPDATED",
      targetType: "PatientProfile",
      targetId: id,
      ipAddress: req.ip
    });

    res.json({ profile: { ...profile, healthcareNumber: maskHealthcareNumber(profile.healthcareNumber) } });
  })
);
