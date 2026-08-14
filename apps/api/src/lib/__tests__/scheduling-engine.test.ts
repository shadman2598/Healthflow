import { describe, expect, it } from "vitest";
import {
  defaultDurationForCategory,
  evaluateInsuranceConstraint,
  evaluatePatientEligibility,
  findOverlappingOccupied,
  generateSlots,
  intervalsOverlap,
  validateBooking,
  waitlistMatchesSlot,
  type WeeklyAvailabilityWindow
} from "@technovate/shared";

const weekdayNineToFive: WeeklyAvailabilityWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  location: "main",
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 5
}));

describe("scheduling engine rules", () => {
  it("maps appointment types to default durations", () => {
    expect(defaultDurationForCategory("CONSULTATION")).toBe(45);
    expect(defaultDurationForCategory("MEDICATION")).toBe(15);
  });

  it("detects overlaps including buffers", () => {
    const occupied = [
      {
        id: "a1",
        startsAt: "2026-06-01T15:00:00.000Z",
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 10
      }
    ];
    // 15:30 would touch buffer-after ending 15:40
    const hits = findOverlappingOccupied(
      { startsAt: "2026-06-01T15:30:00.000Z", durationMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
      occupied
    );
    expect(hits).toHaveLength(1);

    const clear = findOverlappingOccupied(
      { startsAt: "2026-06-01T15:45:00.000Z", durationMinutes: 20 },
      occupied
    );
    expect(clear).toHaveLength(0);
  });

  it("respects double-booking allow flag on occupied visits", () => {
    const occupied = [
      {
        id: "a1",
        startsAt: "2026-06-01T15:00:00.000Z",
        durationMinutes: 30,
        allowDoubleBook: true
      }
    ];
    const hits = findOverlappingOccupied(
      { startsAt: "2026-06-01T15:00:00.000Z", durationMinutes: 30 },
      occupied
    );
    expect(hits).toHaveLength(0);
  });

  it("generates slots only inside recurring availability and outside blocks", () => {
    // Monday 2026-06-01
    const from = new Date("2026-06-01T00:00:00.000Z");
    const to = new Date("2026-06-01T23:59:00.000Z");
    // Use local-aligned times carefully: construct availability using local day
    const localMonday = new Date(2026, 5, 1, 0, 0, 0); // Jun 1 2026 local
    const slots = generateSlots({
      doctorId: "d1",
      from: localMonday,
      to: new Date(2026, 5, 1, 23, 59, 0),
      durationMinutes: 30,
      availability: weekdayNineToFive,
      occupied: [
        {
          id: "busy",
          startsAt: new Date(2026, 5, 1, 10, 0, 0),
          durationMinutes: 30,
          bufferAfterMinutes: 5
        }
      ],
      blocks: [
        {
          startsAt: new Date(2026, 5, 1, 12, 0, 0),
          endsAt: new Date(2026, 5, 1, 13, 0, 0),
          reason: "Lunch"
        }
      ],
      stepMinutes: 30
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.doctorId === "d1")).toBe(true);
    expect(slots.some((s) => new Date(s.startsAt).getHours() === 10)).toBe(false);
    expect(slots.some((s) => new Date(s.startsAt).getHours() === 12)).toBe(false);
    void from;
    void to;
  });

  it("enforces patient eligibility and insurance HCN rules", () => {
    expect(
      evaluatePatientEligibility({
        hasHealthcareNumber: false,
        hasPhone: true,
        hasDateOfBirth: true
      }).ok
    ).toBe(false);

    expect(
      evaluateInsuranceConstraint({
        category: "CHECKUP",
        hasHealthcareNumber: false
      }).ok
    ).toBe(false);

    expect(
      evaluateInsuranceConstraint({
        category: "CHECKUP",
        hasHealthcareNumber: false,
        requiresPrivatePay: true
      }).ok
    ).toBe(true);
  });

  it("validates a complete booking context", () => {
    const scheduledAt = new Date(2026, 5, 1, 11, 0, 0); // Monday 11:00 local
    const result = validateBooking({
      doctorId: "d1",
      specialty: "Family Medicine",
      category: "FOLLOW_UP",
      durationMinutes: 20,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 5,
      allowDoubleBook: false,
      location: "main",
      scheduledAt,
      occupied: [],
      blocks: [],
      availability: weekdayNineToFive,
      eligibility: {
        hasHealthcareNumber: true,
        hasPhone: true,
        hasDateOfBirth: true
      },
      insurance: { category: "FOLLOW_UP", hasHealthcareNumber: true },
      now: new Date(2026, 4, 1)
    });
    expect(result.ok).toBe(true);
  });

  it("rejects blocked and overlapping bookings", () => {
    const scheduledAt = new Date(2026, 5, 1, 12, 15, 0);
    const blocked = validateBooking({
      doctorId: "d1",
      category: "CHECKUP",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowDoubleBook: false,
      location: "main",
      scheduledAt,
      occupied: [],
      blocks: [
        {
          startsAt: new Date(2026, 5, 1, 12, 0, 0),
          endsAt: new Date(2026, 5, 1, 13, 0, 0),
          reason: "PTO"
        }
      ],
      availability: weekdayNineToFive,
      eligibility: { hasHealthcareNumber: true, hasPhone: true, hasDateOfBirth: true },
      insurance: { category: "CHECKUP", hasHealthcareNumber: true },
      now: new Date(2026, 4, 1)
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("BLOCKED_TIME");
  });

  it("matches waitlist preferences", () => {
    expect(
      waitlistMatchesSlot(
        {
          preferredFrom: "2026-06-01T00:00:00.000Z",
          preferredTo: "2026-06-07T00:00:00.000Z",
          doctorId: "d1",
          category: "CHECKUP"
        },
        { startsAt: "2026-06-03T15:00:00.000Z", doctorId: "d1", category: "CHECKUP" }
      )
    ).toBe(true);

    expect(
      waitlistMatchesSlot(
        {
          preferredFrom: "2026-06-01T00:00:00.000Z",
          preferredTo: "2026-06-07T00:00:00.000Z",
          doctorId: "d1"
        },
        { startsAt: "2026-06-03T15:00:00.000Z", doctorId: "d2" }
      )
    ).toBe(false);
  });

  it("interval overlap is exclusive at edges without buffers", () => {
    expect(intervalsOverlap(0, 10, 10, 20)).toBe(false);
    expect(intervalsOverlap(0, 11, 10, 20)).toBe(true);
  });
});

describe("scheduling concurrency edge cases (pure)", () => {
  it("two candidates for the same slot cannot both pass overlap checks", () => {
    const first = {
      id: "winner",
      startsAt: "2026-06-02T15:00:00.000Z",
      durationMinutes: 30,
      bufferAfterMinutes: 5
    };
    const secondAttempt = findOverlappingOccupied(
      { startsAt: "2026-06-02T15:00:00.000Z", durationMinutes: 30 },
      [first]
    );
    expect(secondAttempt).toHaveLength(1);
  });

  it("near-miss slots separated by buffer-after remain free", () => {
    const occupied = [
      {
        id: "a1",
        startsAt: "2026-06-02T15:00:00.000Z",
        durationMinutes: 30,
        bufferAfterMinutes: 5
      }
    ];
    // 15:35 = after 15:00+30+5
    expect(
      findOverlappingOccupied({ startsAt: "2026-06-02T15:35:00.000Z", durationMinutes: 30 }, occupied)
    ).toHaveLength(0);
  });
});
