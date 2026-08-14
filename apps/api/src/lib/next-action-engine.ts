import {
  computeNextActions,
  profileGapsFromAppointments,
  type NextAction,
  type NextActionRole,
  type OpsAppointment,
  type OpsThread
} from "@technovate/shared";
import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";
import type { AuthContext } from "./permissions";
import { AppError } from "../errors/app-error";

function mapRole(auth: AuthContext): NextActionRole {
  if (auth.role === "PATIENT") return "PATIENT";
  if (auth.role === "DOCTOR") return "DOCTOR";
  if (auth.role === "NURSE") return "NURSE";
  if (auth.role === "ADMIN" || auth.role === "SUPER_ADMIN") return "ADMIN";
  return "RECEPTIONIST";
}

function toOpsAppointment(a: {
  id: string;
  scheduledAt: Date;
  status: string;
  reason: string | null;
  category: string | null;
  checkedInAt: Date | null;
  profileId: string | null;
  doctorId: string | null;
  profile?: { firstName: string; lastName: string } | null;
  doctor?: { firstName: string | null; lastName: string | null } | null;
}): OpsAppointment {
  return {
    id: a.id,
    scheduledAt: a.scheduledAt.toISOString(),
    status: a.status,
    reason: a.reason,
    category: a.category ?? undefined,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    profileId: a.profileId,
    doctorId: a.doctorId,
    patientName: a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : undefined,
    doctorName: a.doctor
      ? `Dr. ${a.doctor.firstName ?? ""} ${a.doctor.lastName ?? ""}`.trim()
      : undefined
  };
}

export async function loadNextActionsForAuth(auth: AuthContext, now = new Date()): Promise<NextAction[]> {
  const orgId = auth.activeOrganizationId;
  const role = mapRole(auth);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const appointmentWhere: Record<string, unknown> = {
    organizationId: orgId,
    scheduledAt: { gte: start, lte: end }
  };
  if (role === "PATIENT" && auth.patientProfileId) {
    appointmentWhere.profileId = auth.patientProfileId;
  } else if (role === "DOCTOR" && auth.doctorProfileId) {
    appointmentWhere.doctorId = auth.doctorProfileId;
  }

  const threadWhere: Record<string, unknown> = { organizationId: orgId };
  if (role === "PATIENT" && auth.patientProfileId) {
    threadWhere.patientProfileId = auth.patientProfileId;
  } else if (role === "DOCTOR" && auth.doctorProfileId) {
    threadWhere.OR = [{ assignedDoctorId: auth.doctorProfileId }, { assignedDoctorId: null }];
  }

  const [appointments, threads, overrides] = await Promise.all([
    prisma.appointment.findMany({
      where: appointmentWhere,
      include: {
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            healthcareNumber: true,
            dateOfBirth: true
          }
        },
        doctor: { select: { firstName: true, lastName: true } }
      },
      orderBy: { scheduledAt: "asc" },
      take: 80
    }),
    prisma.messageThread.findMany({
      where: threadWhere,
      include: {
        patientProfile: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 40
    }),
    prisma.nextActionOverride.findMany({
      where: {
        organizationId: orgId,
        userId: auth.userId,
        reversedAt: null,
        status: { in: ["DISMISSED", "COMPLETED"] }
      }
    })
  ]);

  const opsAppts = appointments.map(toOpsAppointment);
  const opsThreads: OpsThread[] = threads.map((t) => ({
    id: t.id,
    status: t.status,
    subject: t.subject,
    assignedDoctorId: t.assignedDoctorId,
    patientProfileId: t.patientProfileId,
    patientName: t.patientProfile
      ? `${t.patientProfile.firstName} ${t.patientProfile.lastName}`
      : undefined
  }));

  const profileGaps = profileGapsFromAppointments(
    appointments.map((a) => ({
      profile: a.profile
        ? {
            id: a.profile.id,
            firstName: a.profile.firstName,
            lastName: a.profile.lastName,
            phone: a.profile.phone,
            email: a.profile.email,
            healthcareNumber: a.profile.healthcareNumber,
            dateOfBirth: a.profile.dateOfBirth?.toISOString() ?? null
          }
        : null
    }))
  );
  const intakeGaps = appointments
    .filter((a) => a.profileId)
    .map((a) => {
      const gap = profileGaps.find((g) => g.id === a.profileId);
      if (!gap) return null;
      return {
        appointmentId: a.id,
        profileId: a.profileId,
        patientName: `${gap.firstName} ${gap.lastName}`,
        missing: gap.missingFields
      };
    })
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  // Derive lightweight admin tasks from message subjects (honest proxies — no insurance SoR).
  const adminTasks = opsThreads
    .filter((t) => /insurance|coverage|phn|document|form|fax/i.test(t.subject))
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      kind: /insurance|coverage|phn/i.test(t.subject)
        ? ("verify_insurance" as const)
        : ("missing_document" as const),
      label: t.subject,
      patientProfileId: t.patientProfileId,
      patientName: t.patientName
    }));

  const dismissedKeys = overrides.filter((o) => o.status === "DISMISSED").map((o) => o.auditKey);
  const completedKeys = overrides.filter((o) => o.status === "COMPLETED").map((o) => o.auditKey);

  return computeNextActions({
    role,
    now,
    appointments: opsAppts,
    threads: opsThreads,
    intakeGaps,
    adminTasks: role === "RECEPTIONIST" || role === "ADMIN" ? adminTasks : undefined,
    doctorProfileId: auth.doctorProfileId,
    patientProfileId: auth.patientProfileId,
    dismissedKeys,
    completedKeys
  });
}

export async function setNextActionOverride(input: {
  auth: AuthContext;
  auditKey: string;
  status: "DISMISSED" | "ACCEPTED" | "COMPLETED";
  reason?: string;
  snapshot?: NextAction;
  ipAddress?: string;
}) {
  const { auth, auditKey, status } = input;
  if (!auditKey.trim()) throw new AppError("auditKey required", 400);

  const row = await prisma.nextActionOverride.upsert({
    where: {
      organizationId_userId_auditKey: {
        organizationId: auth.activeOrganizationId,
        userId: auth.userId,
        auditKey
      }
    },
    create: {
      organizationId: auth.activeOrganizationId,
      userId: auth.userId,
      auditKey,
      status,
      reason: input.reason,
      snapshotJson: input.snapshot ?? undefined
    },
    update: {
      status,
      reason: input.reason,
      snapshotJson: input.snapshot ?? undefined,
      reversedAt: null,
      reversedByUserId: null
    }
  });

  await writeAuditLog({
    organizationId: auth.activeOrganizationId,
    actorId: auth.userId,
    actorRole: auth.role,
    action:
      status === "COMPLETED"
        ? "NEXT_ACTION_COMPLETED"
        : "NEXT_ACTION_DISMISSED",
    targetType: "NextAction",
    targetId: auditKey,
    ipAddress: input.ipAddress,
    metadata: { status, reason: input.reason ?? null, engine: "NEXT_ACTION" }
  });

  return row;
}

export async function restoreNextActionOverride(input: {
  auth: AuthContext;
  auditKey: string;
  ipAddress?: string;
}) {
  const existing = await prisma.nextActionOverride.findUnique({
    where: {
      organizationId_userId_auditKey: {
        organizationId: input.auth.activeOrganizationId,
        userId: input.auth.userId,
        auditKey: input.auditKey
      }
    }
  });
  if (!existing || existing.reversedAt) {
    throw new AppError("Override not found or already restored", 404);
  }

  const row = await prisma.nextActionOverride.update({
    where: { id: existing.id },
    data: {
      reversedAt: new Date(),
      reversedByUserId: input.auth.userId
    }
  });

  await writeAuditLog({
    organizationId: input.auth.activeOrganizationId,
    actorId: input.auth.userId,
    actorRole: input.auth.role,
    action: "NEXT_ACTION_RESTORED",
    targetType: "NextAction",
    targetId: input.auditKey,
    ipAddress: input.ipAddress,
    metadata: { previousStatus: existing.status, engine: "NEXT_ACTION" }
  });

  return row;
}
