import { describe, expect, it } from "vitest";
import {
  ADOPTION_WARNING,
  INFRASTRUCTURE_EQUATION,
  NORTH_STAR_METRIC,
  PRODUCT_ANTI_POSITIONING,
  PRODUCT_POSITIONING,
  STRATEGIC_SOURCES,
  estimateMinutesEliminated,
  isNorthStarCompatiblePrimary,
  productThesis
} from "@technovate/shared";

describe("product positioning (Prompt 49)", () => {
  it("positions as Healthcare OS, not another healthcare app", () => {
    expect(PRODUCT_POSITIONING.toLowerCase()).toContain("operating system");
    expect(PRODUCT_ANTI_POSITIONING).toContain("another healthcare app");
    expect(productThesis().equationOutcome.toLowerCase()).toContain("infrastructure");
  });

  it("defines the minutes-eliminated north-star", () => {
    expect(NORTH_STAR_METRIC.toLowerCase()).toContain("minutes");
    expect(NORTH_STAR_METRIC.toLowerCase()).toContain("unnecessary");
    expect(isNorthStarCompatiblePrimary("downloads")).toBe(false);
    expect(isNorthStarCompatiblePrimary("dau")).toBe(false);
    expect(isNorthStarCompatiblePrimary("desk.manual_tasks_eliminated")).toBe(true);
  });

  it("keeps the full infrastructure equation and research sources", () => {
    expect(INFRASTRUCTURE_EQUATION.length).toBe(8);
    expect(STRATEGIC_SOURCES.length).toBeGreaterThanOrEqual(10);
    expect(ADOPTION_WARNING.toLowerCase()).toContain("patient adoption alone");
  });

  it("estimates minutes eliminated from workflow events", () => {
    const { minutes, contributing } = estimateMinutesEliminated({
      manual_task_eliminated: 10,
      reception_check_in: 5,
      call_avoided_proxy: 2
    });
    expect(minutes).toBe(10 * 3 + 5 * 2 + 2 * 5);
    expect(contributing[0]?.event).toBe("manual_task_eliminated");
  });
});
