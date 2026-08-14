import {
  defaultDurationForCategory,
  findOverlappingOccupied,
  generateSlots,
  hashIdempotencyPayload,
  toScheduleSyncRecord,
  validateBooking,
  waitlistMatchesSlot,
  type AppointmentCategoryCode,
  type OccupiedSlot,
  type ScheduleBlockWindow,
  type WeeklyAvailabilityWindow
} from "@technovate/shared";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError } from "../errors/app-error";
import { sanitizeText } from "./sanitize";

const ACTIVE: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULE_REQUESTED
];

export type BookAppointmentInput = {
  organizationId: string;
  patientId: string;
  profileId?: string | null;
  doctorId: string;
  scheduledAt: Date;
  category: AppointmentCategoryCode;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  location?: string;
  allowDoubleBook?: boolean;
  reason?: string | null;
  patientNotes?: string | null;
  staffNotes?: string | null;
  externalSyncId?: string | null;
  idempotencyKey?: string;
  actorId?: string;
  /** Skip availability window check (admin override). */
  bypassAvailability?: boolean;
};

async function loadAvailability(doctorId: string, organizationId: string): Promise<WeeklyAvailabilityWindow[]> {
  const rows = await prisma.providerAvailability.findMany({
    where: { doctorId, organizationId }
  });
  return rows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    location: r.location,
    bufferBeforeMinutes: r.bufferBeforeMinutes,
    bufferAfterMinutes: r.bufferAfterMinutes,
    allowDoubleBook: r.allowDoubleBook
  }));
}

async function loadBlocks(
  doctorId: string,
  organizationId: string,
  from: Date,
  to: Date
): Promise<ScheduleBlockWindow[]> {
  const rows = await prisma.scheduleBlock.findMany({
    where: {
      organizationId,
      startsAt: { lte: to },
      endsAt: { gte: from },
      OR: [{ doctorId }, { doctorId: null }]
    }
  });
  return rows.map((r) => ({
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    location: r.location,
    reason: r.reason
  }));
}

async function loadOccupied(
  doctorId: string,
  organizationId: string,
  from: Date,
  to: Date,
  excludeAppointmentId?: string
): Promise<OccupiedSlot[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      organizationId,
      doctorId,
      status: { in: ACTIVE },
      scheduledAt: { gte: from, lte: to },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
      allowDoubleBook: true,
      location: true
    }
  });
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.scheduledAt,
    durationMinutes: r.durationMinutes,
    bufferBeforeMinutes: r.bufferBeforeMinutes,
    bufferAfterMinutes: r.bufferAfterMinutes,
    allowDoubleBook: r.allowDoubleBook,
    location: r.location
  }));
}

/**
 * Transactional booking with conflict re-check inside the transaction.
 * Serializable isolation + idempotency key prevents double-book races.
 */
export async function bookAppointmentTransactional(input: BookAppointmentInput) {
  const duration =
    input.durationMinutes ?? defaultDurationForCategory(input.category);
  const location = input.location ?? "main";
  const bufferBefore = input.bufferBeforeMinutes ?? 0;
  const bufferAfter = input.bufferAfterMinutes ?? 5;
  const requestHash = hashIdempotencyPayload([
    input.organizationId,
    input.patientId,
    input.doctorId,
    input.scheduledAt.toISOString(),
    duration,
    input.category,
    location
  ]);

  if (input.idempotencyKey) {
    const existing = await prisma.bookingIdempotency.findUnique({
      where: {
        organizationId_key: {
          organizationId: input.organizationId,
          key: input.idempotencyKey
        }
      }
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError("Idempotency-Key reused with a different booking payload", 409, {
          code: "IDEMPOTENCY_MISMATCH"
        });
      }
      if (existing.appointmentId) {
        const appointment = await prisma.appointment.findUnique({
          where: { id: existing.appointmentId },
          include: { patient: true, doctor: true, profile: true }
        });
        if (appointment) {
          return { appointment, idempotentReplay: true as const };
        }
      }
    }
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, organizationId: input.organizationId },
    include: { profile: true }
  });
  if (!patient) throw new AppError("Patient not found", 404);

  const profileId = input.profileId ?? patient.profileId;
  const profile = profileId
    ? await prisma.patientProfile.findFirst({
        where: { id: profileId, organizationId: input.organizationId }
      })
    : patient.profile;

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: input.doctorId, organizationId: input.organizationId }
  });
  if (!doctor) throw new AppError("Provider not found", 404);

  const windowStart = new Date(input.scheduledAt.getTime() - 12 * 3600_000);
  const windowEnd = new Date(input.scheduledAt.getTime() + 12 * 3600_000);

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        const availability = await tx.providerAvailability.findMany({
          where: { doctorId: input.doctorId, organizationId: input.organizationId }
        });
        const blocks = await tx.scheduleBlock.findMany({
          where: {
            organizationId: input.organizationId,
            startsAt: { lte: windowEnd },
            endsAt: { gte: windowStart },
            OR: [{ doctorId: input.doctorId }, { doctorId: null }]
          }
        });
        const occupied = await tx.appointment.findMany({
          where: {
            organizationId: input.organizationId,
            doctorId: input.doctorId,
            status: { in: ACTIVE },
            scheduledAt: { gte: windowStart, lte: windowEnd }
          }
        });

        const availabilityWindows: WeeklyAvailabilityWindow[] = availability.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          location: r.location,
          bufferBeforeMinutes: r.bufferBeforeMinutes,
          bufferAfterMinutes: r.bufferAfterMinutes,
          allowDoubleBook: r.allowDoubleBook
        }));

        // If no availability configured yet, allow booking with conflict checks only (bootstrap).
        const effectiveAvailability =
          availabilityWindows.length > 0
            ? availabilityWindows
            : input.bypassAvailability
              ? [
                  {
                    dayOfWeek: input.scheduledAt.getDay(),
                    startMinute: 0,
                    endMinute: 24 * 60,
                    location,
                    bufferBeforeMinutes: bufferBefore,
                    bufferAfterMinutes: bufferAfter,
                    allowDoubleBook: input.allowDoubleBook
                  }
                ]
              : availabilityWindows;

        const validation = validateBooking({
          doctorId: input.doctorId,
          specialty: doctor.specialty,
          category: input.category,
          durationMinutes: duration,
          bufferBeforeMinutes: bufferBefore,
          bufferAfterMinutes: bufferAfter,
          allowDoubleBook: Boolean(input.allowDoubleBook),
          location,
          scheduledAt: input.scheduledAt,
          occupied: occupied.map((o) => ({
            id: o.id,
            startsAt: o.scheduledAt,
            durationMinutes: o.durationMinutes,
            bufferBeforeMinutes: o.bufferBeforeMinutes,
            bufferAfterMinutes: o.bufferAfterMinutes,
            allowDoubleBook: o.allowDoubleBook,
            location: o.location
          })),
          blocks: blocks.map((b) => ({
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            location: b.location,
            reason: b.reason
          })),
          availability:
            effectiveAvailability.length > 0
              ? effectiveAvailability
              : [
                  {
                    dayOfWeek: input.scheduledAt.getDay(),
                    startMinute: 0,
                    endMinute: 24 * 60,
                    location,
                    bufferBeforeMinutes: bufferBefore,
                    bufferAfterMinutes: bufferAfter
                  }
                ],
          eligibility: {
            hasHealthcareNumber: Boolean(profile?.healthcareNumber?.trim()),
            hasPhone: Boolean((profile?.phone ?? patient.phone)?.trim()),
            hasDateOfBirth: Boolean(profile?.dateOfBirth),
            isActivePatient: true
          },
          insurance: {
            category: input.category,
            hasHealthcareNumber: Boolean(profile?.healthcareNumber?.trim())
          }
        });

        if (!validation.ok) {
          throw new AppError(validation.message, 409, { code: validation.code });
        }

        const created = await tx.appointment.create({
          data: {
            organizationId: input.organizationId,
            patientId: input.patientId,
            profileId: profileId ?? undefined,
            doctorId: input.doctorId,
            scheduledAt: input.scheduledAt,
            durationMinutes: duration,
            bufferBeforeMinutes: bufferBefore,
            bufferAfterMinutes: bufferAfter,
            location,
            allowDoubleBook: Boolean(input.allowDoubleBook),
            externalSyncId: input.externalSyncId ?? undefined,
            reason: input.reason ? sanitizeText(input.reason, 500) : undefined,
            patientNotes: input.patientNotes ? sanitizeText(input.patientNotes) : undefined,
            staffNotes: input.staffNotes ? sanitizeText(input.staffNotes) : undefined,
            category: input.category,
            status: AppointmentStatus.SCHEDULED
          },
          include: { patient: true, doctor: true, profile: true }
        });

        if (input.idempotencyKey) {
          await tx.bookingIdempotency.create({
            data: {
              organizationId: input.organizationId,
              key: input.idempotencyKey,
              requestHash,
              appointmentId: created.id,
              responseJson: { appointmentId: created.id } as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + 24 * 3600_000)
            }
          });
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return { appointment, idempotentReplay: false as const };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Concurrent serializable conflicts
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2034"
    ) {
      throw new AppError(
        "Scheduling race detected — the slot was taken. Retry with a fresh slot.",
        409,
        { code: "SERIALIZATION_FAILURE" }
      );
    }
    throw error;
  }
}

export async function listAvailableSlots(input: {
  organizationId: string;
  doctorId: string;
  from: Date;
  to: Date;
  category?: AppointmentCategoryCode;
  durationMinutes?: number;
  location?: string;
}) {
  const duration =
    input.durationMinutes ??
    defaultDurationForCategory(input.category ?? "CHECKUP");
  const availability = await loadAvailability(input.doctorId, input.organizationId);
  const blocks = await loadBlocks(input.doctorId, input.organizationId, input.from, input.to);
  const occupied = await loadOccupied(
    input.doctorId,
    input.organizationId,
    new Date(input.from.getTime() - 4 * 3600_000),
    new Date(input.to.getTime() + 4 * 3600_000)
  );

  const slots = generateSlots({
    doctorId: input.doctorId,
    from: input.from,
    to: input.to,
    durationMinutes: duration,
    availability:
      availability.length > 0
        ? availability
        : [
            // Bootstrap: weekdays 9–17 if none configured
            ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
              dayOfWeek,
              startMinute: 9 * 60,
              endMinute: 17 * 60,
              location: input.location ?? "main",
              bufferBeforeMinutes: 0,
              bufferAfterMinutes: 5
            }))
          ],
    occupied,
    blocks,
    location: input.location
  });

  return slots.map((s) =>
    toScheduleSyncRecord("Slot", `${s.doctorId}:${s.startsAt}`, s.startsAt, { ...s })
  );
}

export async function matchWaitlistForSlot(input: {
  organizationId: string;
  doctorId: string;
  startsAt: Date;
  category?: AppointmentCategoryCode;
}) {
  const open = await prisma.waitlistEntry.findMany({
    where: {
      organizationId: input.organizationId,
      status: "OPEN",
      preferredFrom: { lte: input.startsAt },
      preferredTo: { gte: input.startsAt },
      OR: [{ doctorId: input.doctorId }, { doctorId: null }]
    },
    orderBy: { createdAt: "asc" },
    take: 20
  });

  return open.filter((e) =>
    waitlistMatchesSlot(
      {
        preferredFrom: e.preferredFrom,
        preferredTo: e.preferredTo,
        doctorId: e.doctorId,
        category: e.category as AppointmentCategoryCode | null
      },
      {
        startsAt: input.startsAt,
        doctorId: input.doctorId,
        category: input.category
      }
    )
  );
}

/** Keep legacy conflict helper aligned with buffers. */
export async function findScheduleConflicts(query: {
  organizationId: string;
  doctorId?: string | null;
  scheduledAt: Date;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  excludeAppointmentId?: string;
}): Promise<{ id: string; scheduledAt: Date; durationMinutes: number }[]> {
  if (!query.doctorId) return [];
  const duration = query.durationMinutes ?? 30;
  const occupied = await loadOccupied(
    query.doctorId,
    query.organizationId,
    new Date(query.scheduledAt.getTime() - 4 * 3600_000),
    new Date(query.scheduledAt.getTime() + 4 * 3600_000),
    query.excludeAppointmentId
  );
  return findOverlappingOccupied(
    {
      startsAt: query.scheduledAt,
      durationMinutes: duration,
      bufferBeforeMinutes: query.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: query.bufferAfterMinutes ?? 0
    },
    occupied
  ).map((o) => ({
    id: o.id,
    scheduledAt: toDate(o.startsAt),
    durationMinutes: o.durationMinutes
  }));
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
