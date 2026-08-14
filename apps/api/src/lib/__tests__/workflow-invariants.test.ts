import { describe, expect, it } from "vitest";
import { findScheduleConflicts } from "../scheduling";

/**
 * Prompt 46 — workflow-oriented unit stand-ins.
 * Full browser E2E belongs in CI once a test DB is wired; these lock safety invariants.
 */
describe("scheduling conflict invariant", () => {
  it("returns empty conflicts when no doctor is assigned", async () => {
    const conflicts = await findScheduleConflicts({
      organizationId: "org-test",
      doctorId: null,
      scheduledAt: new Date("2026-06-01T15:00:00.000Z"),
      durationMinutes: 30
    });
    expect(conflicts).toEqual([]);
  });
});
