import { describe, expect, it } from "vitest";
import { computeReminderTime, isReminderDue } from "../reminder-engine";

describe("computeReminderTime", () => {
  it("subtracts offset minutes from scheduledAt", () => {
    const scheduledAt = new Date("2026-06-15T10:00:00.000Z");

    expect(computeReminderTime(scheduledAt, 120).toISOString()).toBe("2026-06-15T08:00:00.000Z");
    expect(computeReminderTime(scheduledAt, 1440).toISOString()).toBe("2026-06-14T10:00:00.000Z");
    expect(computeReminderTime(scheduledAt, 2).toISOString()).toBe("2026-06-15T09:58:00.000Z");
  });

  it("handles zero offset (reminder at appointment time)", () => {
    const scheduledAt = new Date("2026-06-15T10:00:00.000Z");
    expect(computeReminderTime(scheduledAt, 0).toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("handles offset that crosses midnight", () => {
    const scheduledAt = new Date("2026-06-15T01:00:00.000Z");
    expect(computeReminderTime(scheduledAt, 120).toISOString()).toBe("2026-06-14T23:00:00.000Z");
  });
});

describe("isReminderDue", () => {
  const scheduledAt = new Date("2026-06-15T10:00:00.000Z");

  it("returns false when now is before reminder time", () => {
    const now = new Date("2026-06-15T07:59:59.999Z");
    expect(isReminderDue(now, scheduledAt, 120)).toBe(false);
  });

  it("returns true at the exact reminder time", () => {
    const now = new Date("2026-06-15T08:00:00.000Z");
    expect(isReminderDue(now, scheduledAt, 120)).toBe(true);
  });

  it("returns true when now is after reminder time", () => {
    const now = new Date("2026-06-15T09:30:00.000Z");
    expect(isReminderDue(now, scheduledAt, 120)).toBe(true);
  });

  it("works with a 24-hour offset", () => {
    expect(isReminderDue(new Date("2026-06-14T09:59:59.000Z"), scheduledAt, 1440)).toBe(false);
    expect(isReminderDue(new Date("2026-06-14T10:00:00.000Z"), scheduledAt, 1440)).toBe(true);
  });

  it("works with a 2-minute offset (quick demo rule)", () => {
    expect(isReminderDue(new Date("2026-06-15T09:57:59.000Z"), scheduledAt, 2)).toBe(false);
    expect(isReminderDue(new Date("2026-06-15T09:58:00.000Z"), scheduledAt, 2)).toBe(true);
  });

  it("returns true when now equals scheduledAt with zero offset", () => {
    expect(isReminderDue(scheduledAt, scheduledAt, 0)).toBe(true);
  });
});
