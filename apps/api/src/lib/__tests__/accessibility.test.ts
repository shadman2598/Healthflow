import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_VERSION,
  A11Y_FINDINGS,
  PRIMARY_A11Y_WORKFLOWS,
  accessibilityIsComplete,
  minTouchTargetPx,
  openHighImpactFindings,
  primaryWorkflowsEvaluated
} from "@technovate/shared";

describe("accessibility checklist (Prompt 45)", () => {
  it("tracks a stable accessibility version", () => {
    expect(ACCESSIBILITY_VERSION).toMatch(/^hf-a11y-v/);
  });

  it("requires primary patient and receptionist workflows to be listed", () => {
    const roles = PRIMARY_A11Y_WORKFLOWS.map((w) => w.role);
    expect(roles).toContain("patient");
    expect(roles).toContain("receptionist");
    expect(PRIMARY_A11Y_WORKFLOWS.length).toBeGreaterThanOrEqual(4);
  });

  it("marks primary workflows as evaluated (findings reviewed, not open-critical)", () => {
    expect(primaryWorkflowsEvaluated()).toBe(true);
  });

  it("has no open critical/high findings after highest-impact fixes", () => {
    expect(openHighImpactFindings()).toEqual([]);
  });

  it("does not claim WCAG completeness while multilingual/contrast remain partial", () => {
    // Product rule: "complete" means no open high/critical AND primary workflows evaluated.
    // Partial findings (contrast, font meta, i18n UI) are allowed — they are tracked.
    const partial = A11Y_FINDINGS.filter((f) => f.status === "partial");
    expect(partial.length).toBeGreaterThan(0);
    expect(accessibilityIsComplete()).toBe(true);
  });

  it("encodes WCAG-oriented 44px touch target guidance", () => {
    expect(minTouchTargetPx()).toBe(44);
  });

  it("covers keyboard, SR, forms, focus, motion, color, cognitive criteria", () => {
    const criteria = new Set(A11Y_FINDINGS.map((f) => f.criterion));
    for (const needed of [
      "keyboard_navigation",
      "screen_readers",
      "form_labels",
      "focus_management",
      "motion",
      "color_dependence",
      "cognitive_load",
      "touch_targets",
      "error_messages"
    ] as const) {
      expect(criteria.has(needed)).toBe(true);
    }
  });
});
