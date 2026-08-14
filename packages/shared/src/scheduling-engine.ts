/**
 * Healthcare scheduling engine (Prompt 38) — pure rules.
 * Domain stays vendor-neutral; DB/transaction adapters live in the API.
 */

export type AppointmentCategoryCode =
  | "CHECKUP"
  | "FOLLOW_UP"
  | "MEDICATION"
  | "LAB_REVIEW"
  | "URGENT"
  | "CONSULTATION"
  | "OTHER";

/** Default visit length by type (minutes). */
export const APPOINTMENT_TYPE_DURATION: Record<AppointmentCategoryCode, number> = {
  CHECKUP: 30,
  FOLLOW_UP: 20,
  MEDICATION: 15,
  LAB_REVIEW: 20,
  URGENT: 30,
  CONSULTATION: 45,
  OTHER: 30
};

export type WeeklyAvailabilityWindow = {
  /** 0 = Sunday … 6 = Saturday (JS getDay). */
  dayOfWeek: number;
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
  location?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  /** If true, overlaps are allowed (rare clinical override). */
  allowDoubleBook?: boolean;
};

export type ScheduleBlockWindow = {
  startsAt: string | Date;
  endsAt: string | Date;
  location?: string | null;
  reason?: string | null;
};

export type OccupiedSlot = {
  id: string;
  startsAt: string | Date;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  allowDoubleBook?: boolean;
  location?: string | null;
};

export type SlotCandidate = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  doctorId: string;
  location: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

export type EligibilityInput = {
  hasHealthcareNumber: boolean;
  hasPhone: boolean;
  hasDateOfBirth: boolean;
  isActivePatient?: boolean;
};

export type InsuranceConstraintInput = {
  category: AppointmentCategoryCode;
  hasHealthcareNumber: boolean;
  /** Admin / uninsured visit flag from clinic policy. */
  requiresPrivatePay?: boolean;
};

export type BookingRuleContext = {
  doctorId: string;
  specialty?: string | null;
  category: AppointmentCategoryCode;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  allowDoubleBook: boolean;
  location: string;
  scheduledAt: Date;
  occupied: OccupiedSlot[];
  blocks: ScheduleBlockWindow[];
  availability: WeeklyAvailabilityWindow[];
  eligibility: EligibilityInput;
  insurance: InsuranceConstraintInput;
  /** Timezone-agnostic: treat scheduledAt as clinic-local instant for day-of-week. */
  now?: Date;
};

export type BookingValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function defaultDurationForCategory(category: AppointmentCategoryCode): number {
  return APPOINTMENT_TYPE_DURATION[category] ?? 30;
}

export function intervalBounds(
  startsAt: string | Date,
  durationMinutes: number,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0
): { start: number; end: number } {
  const start = toDate(startsAt).getTime() - bufferBeforeMinutes * 60_000;
  const end = toDate(startsAt).getTime() + (durationMinutes + bufferAfterMinutes) * 60_000;
  return { start, end };
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function findOverlappingOccupied(
  candidate: {
    startsAt: string | Date;
    durationMinutes: number;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
  },
  occupied: OccupiedSlot[],
  opts?: { ignoreAllowDoubleBook?: boolean }
): OccupiedSlot[] {
  const c = intervalBounds(
    candidate.startsAt,
    candidate.durationMinutes,
    candidate.bufferBeforeMinutes ?? 0,
    candidate.bufferAfterMinutes ?? 0
  );
  return occupied.filter((o) => {
    if (!opts?.ignoreAllowDoubleBook && o.allowDoubleBook) return false;
    const b = intervalBounds(
      o.startsAt,
      o.durationMinutes,
      o.bufferBeforeMinutes ?? 0,
      o.bufferAfterMinutes ?? 0
    );
    return intervalsOverlap(c.start, c.end, b.start, b.end);
  });
}

export function isInsideBlock(
  startsAt: string | Date,
  durationMinutes: number,
  blocks: ScheduleBlockWindow[]
): ScheduleBlockWindow | null {
  const c = intervalBounds(startsAt, durationMinutes, 0, 0);
  for (const block of blocks) {
    const bStart = toDate(block.startsAt).getTime();
    const bEnd = toDate(block.endsAt).getTime();
    if (intervalsOverlap(c.start, c.end, bStart, bEnd)) return block;
  }
  return null;
}

export function isWithinAvailability(
  startsAt: Date,
  durationMinutes: number,
  availability: WeeklyAvailabilityWindow[],
  location?: string
): WeeklyAvailabilityWindow | null {
  const day = startsAt.getDay();
  const startMin = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMin = startMin + durationMinutes;
  for (const window of availability) {
    if (window.dayOfWeek !== day) continue;
    if (location && window.location && window.location !== location) continue;
    if (startMin >= window.startMinute && endMin <= window.endMinute) return window;
  }
  return null;
}

export function evaluatePatientEligibility(input: EligibilityInput): BookingValidation {
  if (input.isActivePatient === false) {
    return { ok: false, code: "PATIENT_INACTIVE", message: "Patient is inactive and cannot be booked" };
  }
  if (!input.hasHealthcareNumber) {
    return {
      ok: false,
      code: "MISSING_HCN",
      message: "Healthcare number required for clinic eligibility"
    };
  }
  if (!input.hasPhone) {
    return { ok: false, code: "MISSING_PHONE", message: "Phone required for reminders and reachability" };
  }
  return { ok: true };
}

/**
 * Honest insurance gate — HealthFlow is not a payer SoR.
 * Medically necessary visit types need an HCN; private-pay admin visits may proceed with a flag.
 */
export function evaluateInsuranceConstraint(input: InsuranceConstraintInput): BookingValidation {
  if (input.requiresPrivatePay) return { ok: true };
  const medicallyNecessary = !["OTHER"].includes(input.category);
  if (medicallyNecessary && !input.hasHealthcareNumber) {
    return {
      ok: false,
      code: "INSURANCE_HCN_REQUIRED",
      message: "Provincial coverage visits require a healthcare number on file"
    };
  }
  return { ok: true };
}

export function evaluateSpecialtyFit(input: {
  specialty?: string | null;
  category: AppointmentCategoryCode;
}): BookingValidation {
  if (!input.specialty) return { ok: true };
  const spec = input.specialty.toLowerCase();
  if (input.category === "LAB_REVIEW" && /surg|ortho|cardio/.test(spec) === false && /lab|path|family|internal|general/.test(spec)) {
    return { ok: true };
  }
  // Soft rule — never hard-block unknown specialties.
  return { ok: true };
}

export function validateBooking(ctx: BookingRuleContext): BookingValidation {
  const eligibility = evaluatePatientEligibility(ctx.eligibility);
  if (!eligibility.ok) return eligibility;

  const insurance = evaluateInsuranceConstraint(ctx.insurance);
  if (!insurance.ok) return insurance;

  const specialty = evaluateSpecialtyFit({ specialty: ctx.specialty, category: ctx.category });
  if (!specialty.ok) return specialty;

  if (ctx.scheduledAt.getTime() < (ctx.now ?? new Date()).getTime() - 60_000) {
    return { ok: false, code: "PAST_SLOT", message: "Cannot book a slot in the past" };
  }

  const window = isWithinAvailability(
    ctx.scheduledAt,
    ctx.durationMinutes,
    ctx.availability,
    ctx.location
  );
  if (!window) {
    return {
      ok: false,
      code: "OUTSIDE_AVAILABILITY",
      message: "Slot is outside provider recurring availability"
    };
  }

  const block = isInsideBlock(ctx.scheduledAt, ctx.durationMinutes, ctx.blocks);
  if (block) {
    return {
      ok: false,
      code: "BLOCKED_TIME",
      message: `Slot overlaps a blocked time${block.reason ? `: ${block.reason}` : ""}`
    };
  }

  if (!ctx.allowDoubleBook) {
    const overlaps = findOverlappingOccupied(
      {
        startsAt: ctx.scheduledAt,
        durationMinutes: ctx.durationMinutes,
        bufferBeforeMinutes: ctx.bufferBeforeMinutes,
        bufferAfterMinutes: ctx.bufferAfterMinutes
      },
      ctx.occupied,
      { ignoreAllowDoubleBook: false }
    );
    if (overlaps.length > 0) {
      return {
        ok: false,
        code: "DOUBLE_BOOKING",
        message: "Slot overlaps an existing visit (including buffers)"
      };
    }
  }

  return { ok: true };
}

/** Expand weekly availability into concrete slot starts for a date range. */
export function generateSlots(input: {
  doctorId: string;
  from: Date;
  to: Date;
  durationMinutes: number;
  availability: WeeklyAvailabilityWindow[];
  occupied: OccupiedSlot[];
  blocks: ScheduleBlockWindow[];
  stepMinutes?: number;
  location?: string;
}): SlotCandidate[] {
  const step = input.stepMinutes ?? input.durationMinutes;
  const slots: SlotCandidate[] = [];
  const cursor = new Date(input.from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= input.to.getTime()) {
    const dayWindows = input.availability.filter((w) => w.dayOfWeek === cursor.getDay());
    for (const window of dayWindows) {
      if (input.location && window.location && window.location !== input.location) continue;
      const location = window.location ?? input.location ?? "main";
      const bufferBefore = window.bufferBeforeMinutes ?? 0;
      const bufferAfter = window.bufferAfterMinutes ?? 0;
      for (let minute = window.startMinute; minute + input.durationMinutes <= window.endMinute; minute += step) {
        const startsAt = new Date(cursor);
        startsAt.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        if (startsAt < input.from || startsAt > input.to) continue;

        const validation = validateBooking({
          doctorId: input.doctorId,
          category: "OTHER",
          durationMinutes: input.durationMinutes,
          bufferBeforeMinutes: bufferBefore,
          bufferAfterMinutes: bufferAfter,
          allowDoubleBook: Boolean(window.allowDoubleBook),
          location,
          scheduledAt: startsAt,
          occupied: input.occupied,
          blocks: input.blocks,
          availability: input.availability,
          eligibility: { hasHealthcareNumber: true, hasPhone: true, hasDateOfBirth: true },
          insurance: { category: "OTHER", hasHealthcareNumber: true },
          now: input.from
        });
        // Slot generation skips eligibility/insurance — only time geometry.
        const blocked = isInsideBlock(startsAt, input.durationMinutes, input.blocks);
        const overlaps = window.allowDoubleBook
          ? []
          : findOverlappingOccupied(
              {
                startsAt,
                durationMinutes: input.durationMinutes,
                bufferBeforeMinutes: bufferBefore,
                bufferAfterMinutes: bufferAfter
              },
              input.occupied
            );
        const inWindow = isWithinAvailability(
          startsAt,
          input.durationMinutes,
          input.availability,
          location
        );
        if (!blocked && overlaps.length === 0 && inWindow) {
          const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
          slots.push({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            durationMinutes: input.durationMinutes,
            doctorId: input.doctorId,
            location,
            bufferBeforeMinutes: bufferBefore,
            bufferAfterMinutes: bufferAfter
          });
        }
        void validation;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

export type WaitlistMatchInput = {
  preferredFrom: string | Date;
  preferredTo: string | Date;
  doctorId?: string | null;
  category?: AppointmentCategoryCode | null;
};

export function waitlistMatchesSlot(
  entry: WaitlistMatchInput,
  slot: { startsAt: string | Date; doctorId: string; category?: AppointmentCategoryCode }
): boolean {
  const t = toDate(slot.startsAt).getTime();
  if (t < toDate(entry.preferredFrom).getTime() || t > toDate(entry.preferredTo).getTime()) {
    return false;
  }
  if (entry.doctorId && entry.doctorId !== slot.doctorId) return false;
  if (entry.category && slot.category && entry.category !== slot.category) return false;
  return true;
}

/** External sync envelope so other schedulers can reconcile without owning HealthFlow IDs. */
export type ScheduleSyncRecord = {
  resourceType: "Slot" | "Appointment" | "ScheduleBlock" | "WaitlistEntry";
  id: string;
  version: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

export function toScheduleSyncRecord(
  resourceType: ScheduleSyncRecord["resourceType"],
  id: string,
  updatedAt: string | Date,
  payload: Record<string, unknown>
): ScheduleSyncRecord {
  const updated = toDate(updatedAt).toISOString();
  return {
    resourceType,
    id,
    version: updated,
    updatedAt: updated,
    payload
  };
}
