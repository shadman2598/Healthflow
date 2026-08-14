import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULE_REQUESTED
];

export type SlotConflictQuery = {
  organizationId: string;
  doctorId?: string | null;
  scheduledAt: Date;
  durationMinutes?: number;
  excludeAppointmentId?: string;
};

/**
 * Detect overlapping appointments for the same clinician (Prompt 38).
 * Buffer: uses durationMinutes on each side.
 */
export async function findScheduleConflicts(query: SlotConflictQuery): Promise<
  { id: string; scheduledAt: Date; durationMinutes: number }[]
> {
  if (!query.doctorId) return [];

  const duration = query.durationMinutes ?? 30;
  const start = query.scheduledAt.getTime();
  const end = start + duration * 60_000;
  const windowStart = new Date(start - 4 * 60 * 60_000);
  const windowEnd = new Date(end + 4 * 60 * 60_000);

  const candidates = await prisma.appointment.findMany({
    where: {
      organizationId: query.organizationId,
      doctorId: query.doctorId,
      status: { in: ACTIVE_STATUSES },
      scheduledAt: { gte: windowStart, lte: windowEnd },
      ...(query.excludeAppointmentId ? { id: { not: query.excludeAppointmentId } } : {})
    },
    select: { id: true, scheduledAt: true, durationMinutes: true }
  });

  return candidates.filter((c) => {
    const cStart = c.scheduledAt.getTime();
    const cEnd = cStart + (c.durationMinutes || 30) * 60_000;
    return start < cEnd && end > cStart;
  });
}

/** Quiet-hours check: if start/end set and now's hour is inside the window, suppress. */
export function isInsideQuietHours(
  now: Date,
  quietHoursStart: number | null | undefined,
  quietHoursEnd: number | null | undefined
): boolean {
  if (quietHoursStart == null || quietHoursEnd == null) return false;
  const hour = now.getHours();
  if (quietHoursStart === quietHoursEnd) return false;
  if (quietHoursStart < quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  // Wraps midnight (e.g. 21 → 7)
  return hour >= quietHoursStart || hour < quietHoursEnd;
}
