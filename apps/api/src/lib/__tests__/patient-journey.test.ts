import { describe, expect, it } from "vitest";
import { resolvePatientNextStep, type JourneyAppointment } from "@technovate/shared";

const future = (hoursFromNow: number): string =>
  new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

const past = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 24 * 3600_000).toISOString();

function appt(partial: Partial<JourneyAppointment> & Pick<JourneyAppointment, "id" | "status">): JourneyAppointment {
  return {
    scheduledAt: future(48),
    reason: "Checkup",
    category: "CHECKUP",
    ...partial
  };
}

describe("resolvePatientNextStep", () => {
  it("asks guests to sign in first", () => {
    const step = resolvePatientNextStep({ isGuest: true, appointments: [], threads: [] });
    expect(step.id).toBe("guest_sign_in");
    expect(step.primary.href).toBe("/login/patient");
  });

  it("prioritizes confirming SCHEDULED visits", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [appt({ id: "a1", status: "SCHEDULED" })],
      threads: [{ id: "t1", status: "PENDING" }]
    });
    expect(step.id).toBe("confirm_visit");
  });

  it("routes CONFIRMED visits to prep", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [appt({ id: "a1", status: "CONFIRMED" })],
      threads: []
    });
    expect(step.id).toBe("prep_visit");
    expect(step.primary.href).toContain("care-guide?tab=prep");
  });

  it("shows awaiting state for reschedule requests", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [appt({ id: "a1", status: "RESCHEDULE_REQUESTED" })],
      threads: []
    });
    expect(step.id).toBe("awaiting_reschedule");
  });

  it("surfaces message attention when no active visit urgency", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [],
      threads: [{ id: "t1", status: "UNREAD" }]
    });
    expect(step.id).toBe("open_messages");
  });

  it("offers visit request when calendar is empty", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [appt({ id: "old", status: "CANCELLED", scheduledAt: past(30) })],
      threads: []
    });
    expect(step.id).toBe("request_visit");
    expect(step.primary.href).toContain("/messages?draft=");
  });

  it("soft-follows up after a recent completed visit", () => {
    const step = resolvePatientNextStep({
      isGuest: false,
      appointments: [appt({ id: "done", status: "COMPLETED", scheduledAt: past(3) })],
      threads: []
    });
    expect(step.id).toBe("follow_up");
  });
});
