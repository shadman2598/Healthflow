import { describe, expect, it } from "vitest";
import { findScheduleConflicts } from "../scheduling";
import { WORKFLOW_E2E_VERSION } from "@technovate/shared";

/**
 * Prompt 46 companions — DB-facing scheduling invariant.
 * Full multi-role journeys live in workflow-e2e.test.ts (ClinicWorld harness).
 */
describe("scheduling conflict invariant", () => {
  it("points journey E2E at the shared harness", () => {
    expect(WORKFLOW_E2E_VERSION).toMatch(/^hf-workflow-e2e-v/);
  });

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
