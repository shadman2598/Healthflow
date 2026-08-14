import { Router } from "express";
import {
  loginSchema,
  patientSignupSchema,
  staffSignupSchema,
  createStaffSchema,
  selectClinicSchema,
  createInviteSchema
} from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import {
  clearAuthCookie,
  comparePassword,
  hashPassword,
  setActiveOrganizationCookie,
  setAuthCookie,
  signAuthToken
} from "../utils/auth";
import { requireAuth } from "../middleware/require-auth";
import { requireRoles } from "../middleware/require-role";
import { requirePermissions } from "../middleware/require-permission";
import { rateLimit } from "../middleware/rate-limit";
import { writeAuditLog } from "../lib/audit";
import { roleDashboardPath } from "../lib/permissions";
import { enrichAuth } from "../middleware/enrich-auth";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: "login" });

function serializeUser(user: {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  organizationId: string;
  lastLoginAt: Date | null;
  privacyConsentAt: Date | null;
  organization?: { id: string; name: string; createdAt: Date };
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    organizationId: user.organizationId,
    lastLoginAt: user.lastLoginAt,
    privacyConsentAt: user.privacyConsentAt,
    organization: user.organization,
    redirectTo: roleDashboardPath(user.role as never)
  };
}

async function issueSession(
  res: Parameters<typeof setAuthCookie>[0],
  user: { id: string; email: string; role: string; organizationId: string; organization?: { id: string; name: string; createdAt: Date }; createdAt: Date; lastLoginAt: Date | null; privacyConsentAt: Date | null },
  ip?: string
) {
  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    role: user.role as never,
    organizationId: user.organizationId
  });

  setAuthCookie(res, token);
  setActiveOrganizationCookie(res, user.organizationId);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    actorRole: user.role as never,
    action: "LOGIN",
    ipAddress: ip,
    metadata: { email: user.email }
  });

  return serializeUser(user);
}

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { organization: true }
    });
    if (!user || !user.isActive) throw new AppError("Invalid credentials", 401);

    const isValid = await comparePassword(body.password, user.passwordHash);
    if (!isValid) throw new AppError("Invalid credentials", 401);

    const payload = await issueSession(res, user, req.ip);
    res.json({
      user: {
        ...payload,
        activeOrganizationId: user.organizationId,
        organization: user.organization
      }
    });
  })
);

authRouter.post(
  "/signup/patient",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = patientSignupSchema.parse(req.body);

    const clinic = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!clinic) throw new AppError("No clinic configured", 503);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError("Email already registered", 409);

    const dupHcn = await prisma.patientProfile.findFirst({
      where: { organizationId: clinic.id, healthcareNumber: body.healthcareNumber }
    });
    if (dupHcn) throw new AppError("Healthcare number already on file", 409);

    const user = await prisma.user.create({
      data: {
        organizationId: clinic.id,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: "PATIENT",
        privacyConsentAt: new Date(),
        patientProfile: {
          create: {
            organizationId: clinic.id,
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            phone: body.phone,
            healthcareNumber: body.healthcareNumber,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined
          }
        }
      },
      include: { organization: true, patientProfile: true }
    });

    if (user.patientProfile) {
      await prisma.patient.create({
        data: {
          organizationId: clinic.id,
          profileId: user.patientProfile.id,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone
        }
      });
    }

    await writeAuditLog({
      organizationId: clinic.id,
      actorId: user.id,
      actorRole: "PATIENT",
      action: "PATIENT_CREATED",
      targetType: "PatientProfile",
      targetId: user.patientProfile?.id,
      ipAddress: req.ip
    });

    const payload = await issueSession(res, user, req.ip);
    res.status(201).json({ user: { ...payload, activeOrganizationId: clinic.id } });
  })
);

authRouter.post(
  "/signup/staff",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = staffSignupSchema.parse(req.body);
    const inviteCode = body.inviteCode.trim().toUpperCase();

    if (body.role !== "RECEPTIONIST" && body.role !== "DOCTOR") {
      throw new AppError("Staff sign-up is limited to doctor and receptionist roles", 403);
    }

    const invite = await prisma.roleInvite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new AppError("Invalid or expired invite code", 400);
    }
    if (invite.role !== body.role) throw new AppError("Invite code does not match role", 400);
    if (invite.email && invite.email !== body.email) throw new AppError("Invite email mismatch", 400);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError("Email already exists", 409);

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: invite.organizationId,
          email: body.email,
          passwordHash,
          role: body.role,
          isActive: true,
          ...(body.role === "DOCTOR"
            ? {
                doctorProfile: {
                  create: {
                    organizationId: invite.organizationId,
                    firstName: body.firstName,
                    lastName: body.lastName
                  }
                }
              }
            : {
                staffProfile: {
                  create: {
                    organizationId: invite.organizationId,
                    firstName: body.firstName,
                    lastName: body.lastName
                  }
                }
              })
        },
        include: { organization: true }
      });

      await tx.roleInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedByUserId: created.id }
      });

      return created;
    });

    await writeAuditLog({
      organizationId: invite.organizationId,
      actorId: user.id,
      actorRole: user.role,
      action: "STAFF_INVITE_USED",
      targetType: "RoleInvite",
      targetId: invite.id,
      ipAddress: req.ip
    });

    const payload = await issueSession(res, user, req.ip);
    res.status(201).json({ user: { ...payload, activeOrganizationId: invite.organizationId } });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  enrichAuth,
  asyncHandler(async (req, res) => {
    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "LOGOUT",
      ipAddress: req.ip
    });
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  enrichAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: {
        organization: true,
        patientProfile: true,
        doctorProfile: true,
        staffProfile: true
      }
    });
    if (!user || !user.isActive) throw new AppError("Unauthorized", 401);

    res.json({
      user: {
        ...serializeUser(user),
        activeOrganizationId: req.auth!.activeOrganizationId,
        patientProfile: user.patientProfile,
        doctorProfile: user.doctorProfile,
        staffProfile: user.staffProfile
      }
    });
  })
);

authRouter.get(
  "/doctors",
  requireAuth,
  requireRoles("RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const doctors = await prisma.doctorProfile.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });
    res.json({ doctors });
  })
);

authRouter.get(
  "/staff",
  requireAuth,
  requirePermissions("staff:read"),
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.activeOrganizationId;
    const users = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        role: { in: ["RECEPTIONIST", "DOCTOR", "ADMIN"] }
      },
      include: {
        doctorProfile: true,
        staffProfile: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      staff: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        firstName: u.doctorProfile?.firstName ?? u.staffProfile?.firstName ?? null,
        lastName: u.doctorProfile?.lastName ?? u.staffProfile?.lastName ?? null,
        doctorProfileId: u.doctorProfile?.id ?? null
      }))
    });
  })
);

authRouter.post(
  "/staff",
  requireAuth,
  requirePermissions("staff:manage"),
  asyncHandler(async (req, res) => {
    const body = createStaffSchema.parse(req.body);
    const targetOrganizationId = body.organizationId ?? req.auth!.activeOrganizationId;

    if (body.role === "ADMIN" && req.auth!.role !== "ADMIN" && req.auth!.role !== "SUPER_ADMIN") {
      throw new AppError("Only administrators can create admin accounts", 403);
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError("Email already exists", 409);

    const user = await prisma.user.create({
      data: {
        organizationId: targetOrganizationId,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        ...(body.role === "DOCTOR"
          ? {
              doctorProfile: {
                create: {
                  organizationId: targetOrganizationId,
                  firstName: body.firstName,
                  lastName: body.lastName
                }
              }
            }
          : body.role === "RECEPTIONIST"
            ? {
                staffProfile: {
                  create: {
                    organizationId: targetOrganizationId,
                    firstName: body.firstName,
                    lastName: body.lastName
                  }
                }
              }
            : {})
      },
      select: { id: true, email: true, role: true, createdAt: true, organizationId: true }
    });

    res.status(201).json({ user });
  })
);

authRouter.get(
  "/invites",
  requireAuth,
  requirePermissions("staff:manage"),
  asyncHandler(async (req, res) => {
    const invites = await prisma.roleInvite.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      orderBy: { createdAt: "desc" }
    });
    res.json({ invites });
  })
);

authRouter.post(
  "/invites",
  requireAuth,
  requirePermissions("staff:manage"),
  asyncHandler(async (req, res) => {
    const body = createInviteSchema.parse(req.body);
    const orgId = req.auth!.activeOrganizationId;
    const prefix = body.role === "DOCTOR" ? "HF-DOCTOR" : "HF-RECEPT";
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);

    const invite = await prisma.roleInvite.create({
      data: {
        organizationId: orgId,
        code,
        role: body.role,
        email: body.email,
        expiresAt
      }
    });

    res.status(201).json({ invite });
  })
);

authRouter.get(
  "/clinics",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.auth!.role === "ADMIN" || req.auth!.role === "SUPER_ADMIN") {
      const clinics = await prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
      res.json({ clinics, activeOrganizationId: req.auth!.activeOrganizationId });
      return;
    }

    const clinic = await prisma.organization.findUnique({ where: { id: req.auth!.organizationId } });
    res.json({
      clinics: clinic ? [clinic] : [],
      activeOrganizationId: req.auth!.organizationId
    });
  })
);

authRouter.post(
  "/select-clinic",
  requireAuth,
  requirePermissions("clinic:switch_org"),
  asyncHandler(async (req, res) => {
    const body = selectClinicSchema.parse(req.body);
    const clinic = await prisma.organization.findUnique({ where: { id: body.organizationId } });
    if (!clinic) throw new AppError("Clinic not found", 404);

    setActiveOrganizationCookie(res, clinic.id);
    res.json({ ok: true, activeOrganizationId: clinic.id });
  })
);
