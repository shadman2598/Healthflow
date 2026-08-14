import { Router } from "express";
import {
  createPatientProfileSchema,
  idParamSchema,
  patientReminderPrefsSchema,
  patientsQuerySchema,
  updatePatientProfileSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { canManagePatients, isClinicOps, authHasPermission } from "../lib/permissions";
import { assertCanViewPatientProfile, doctorAccessibleProfilesWhere } from "../lib/patient-access";
import { assertSameOrganization } from "../lib/org-scope";
import { maskHealthcareNumber, sanitizeText } from "../lib/sanitize";
import { writeAuditLog } from "../lib/audit";
import { mergeProfileDemographics } from "../lib/data-propagation";

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

    const doctorScope =
      req.auth!.role === "DOCTOR" && req.auth!.doctorProfileId
        ? doctorAccessibleProfilesWhere(req.auth!.doctorProfileId)
        : {};

    const profiles = await prisma.patientProfile.findMany({
      where: { organizationId: orgId, ...doctorScope },
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
      res.json({
        profiles: profile
          ? [{ ...profile, healthcareNumber: maskHealthcareNumber(profile.healthcareNumber) }]
          : []
      });
      return;
    }

    const where = {
      organizationId: orgId,
      AND: [
        ...(req.auth!.role === "DOCTOR" && req.auth!.doctorProfileId
          ? [doctorAccessibleProfilesWhere(req.auth!.doctorProfileId)]
          : []),
        ...(query.q
          ? [
              {
                OR: [
                  { firstName: { contains: query.q, mode: "insensitive" as const } },
                  { lastName: { contains: query.q, mode: "insensitive" as const } },
                  { email: { contains: query.q, mode: "insensitive" as const } },
                  { phone: { contains: query.q } },
                  { healthcareNumber: { contains: query.q } }
                ]
              }
            ]
          : [])
      ]
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
    if (!isClinicOps(req.auth!)) throw new AppError("Forbidden", 403);

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
    await assertCanViewPatientProfile(req.auth!, id);

    const profile = await prisma.patientProfile.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId },
      include: {
        assignedDoctor: true,
        appointments: { orderBy: { scheduledAt: "desc" }, take: 20 },
        messageThreads: { orderBy: { updatedAt: "desc" }, take: 5 }
      }
    });
    if (!profile) throw new AppError("Patient not found", 404);
    assertSameOrganization(req.auth!, profile.organizationId);

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
    const canReveal = authHasPermission(req.auth!, "patient:reveal_hcn");
    res.json({
      profile: {
        ...profile,
        healthcareNumber: maskHealthcareNumber(profile.healthcareNumber),
        internalNotes: isStaff ? profile.internalNotes : undefined,
        canRevealHealthcareNumber: canReveal
      }
    });
  })
);

patientProfilesRouter.post(
  "/:id/reveal-hcn",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await assertCanViewPatientProfile(req.auth!, id);
    if (!authHasPermission(req.auth!, "patient:reveal_hcn")) throw new AppError("Forbidden", 403);

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
    const auth = req.auth!;
    const isPatientSelf = auth.role === "PATIENT" && auth.patientProfileId === id;

    if (!canManagePatients(auth) && !isPatientSelf) {
      throw new AppError("Forbidden", 403);
    }

    if (auth.role === "DOCTOR") {
      await assertCanViewPatientProfile(auth, id);
    }

    const existing = await prisma.patientProfile.findFirst({
      where: { id, organizationId: auth.activeOrganizationId }
    });
    if (!existing) throw new AppError("Patient not found", 404);

    if (auth.role === "PATIENT") {
      if (existing.userId !== auth.userId) throw new AppError("Forbidden", 403);
      const prefs = patientReminderPrefsSchema.parse(req.body);
      const profile = await prisma.patientProfile.update({
        where: { id },
        data: prefs
      });

      await writeAuditLog({
        organizationId: auth.activeOrganizationId,
        actorId: auth.userId,
        actorRole: auth.role,
        action: "PATIENT_UPDATED",
        targetType: "PatientProfile",
        targetId: id,
        ipAddress: req.ip,
        metadata: { fields: Object.keys(prefs) }
      });

      res.json({
        profile: { ...profile, healthcareNumber: maskHealthcareNumber(profile.healthcareNumber) }
      });
      return;
    }

    const data = updatePatientProfileSchema.parse(req.body);
    const { allowOverwriteDemographics, ...fields } = data;

    const demo = mergeProfileDemographics({
      profileId: id,
      actorRole: auth.role,
      existing: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
        healthcareNumber: existing.healthcareNumber,
        address: existing.address,
        dateOfBirth: existing.dateOfBirth
      },
      proposed: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        healthcareNumber: fields.healthcareNumber,
        address: fields.address,
        dateOfBirth: fields.dateOfBirth
      },
      allowOverwriteDemographics
    });

    const profile = await prisma.$transaction(async (tx) => {
      const updated = await tx.patientProfile.update({
        where: { id },
        data: {
          ...demo.data,
          ...(fields.heightCm !== undefined ? { heightCm: fields.heightCm } : {}),
          ...(fields.weightKg !== undefined ? { weightKg: fields.weightKg } : {}),
          ...(fields.internalNotes !== undefined
            ? { internalNotes: fields.internalNotes ? sanitizeText(fields.internalNotes) : fields.internalNotes }
            : {}),
          ...(fields.assignedDoctorId !== undefined ? { assignedDoctorId: fields.assignedDoctorId } : {}),
          ...(fields.isRegularPatient !== undefined ? { isRegularPatient: fields.isRegularPatient } : {}),
          ...(fields.reminderPrefEmail !== undefined ? { reminderPrefEmail: fields.reminderPrefEmail } : {}),
          ...(fields.reminderPrefSms !== undefined ? { reminderPrefSms: fields.reminderPrefSms } : {}),
          ...(fields.reminderPrefApp !== undefined ? { reminderPrefApp: fields.reminderPrefApp } : {}),
          ...(fields.reminderFrequency !== undefined ? { reminderFrequency: fields.reminderFrequency } : {})
        }
      });

      // Keep reminder-engine Patient row in sync — never a second demographic entry point.
      if (demo.mirror) {
        await tx.patient.updateMany({
          where: { profileId: id, organizationId: auth.activeOrganizationId },
          data: demo.mirror
        });
      }

      return updated;
    });

    await writeAuditLog({
      organizationId: auth.activeOrganizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: "PATIENT_UPDATED",
      targetType: "PatientProfile",
      targetId: id,
      ipAddress: req.ip,
      metadata: {
        provenance: demo.provenance,
        mirroredToPatient: Boolean(demo.mirror),
        allowOverwriteDemographics: Boolean(allowOverwriteDemographics)
      }
    });

    res.json({ profile: { ...profile, healthcareNumber: maskHealthcareNumber(profile.healthcareNumber) } });
  })
);
