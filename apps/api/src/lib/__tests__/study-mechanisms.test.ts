import { describe, expect, it } from "vitest";
import {
  COMBINED_MECHANISMS,
  STUDY_NON_GOALS,
  STUDY_PRODUCTS,
  coreStudyProducts,
  studyDesignRule
} from "@technovate/shared";

describe("study mechanisms (Prompt 1)", () => {
  it("studies multiple success types without treating downloads as success", () => {
    expect(STUDY_PRODUCTS.length).toBe(10);
    expect(coreStudyProducts().map((p) => p.id).sort()).toEqual(
      ["athena", "epic-mychart", "goodrx", "zocdoc"].sort()
    );
    expect(studyDesignRule().toLowerCase()).toContain("do not copy");
  });

  it("combines core mechanisms into real HealthFlow routes", () => {
    const hrefs = COMBINED_MECHANISMS.map((m) => m.href);
    expect(hrefs).toContain("/calendar");
    expect(hrefs).toContain("/resources");
    expect(hrefs).toContain("/patient/care-guide");
    expect(COMBINED_MECHANISMS.every((m) => m.href.startsWith("/"))).toBe(true);
  });

  it("explicitly refuses copycat products", () => {
    expect(STUDY_NON_GOALS).toContain("National provider marketplace");
    expect(STUDY_NON_GOALS).toContain("Telehealth network");
    expect(STUDY_PRODUCTS.find((p) => p.id === "doximity")?.priority).toBe("defer");
  });
});
