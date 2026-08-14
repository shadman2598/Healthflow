import { AppointmentStatus } from "@prisma/client";

export { findScheduleConflicts } from "./scheduling-engine";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULE_REQUESTED
];

export { ACTIVE_STATUSES };

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
