import { describe, expect, it } from "vitest";
import {
  DATA_USE_WAIVER,
  HELPER_DISCLAIMER,
  HELPER_NAME,
  PATIENT_NEEDS,
  ageYearsFromDob,
  pickDaypartSlot,
  replyForHelperQuestion,
  shouldUseEasyMode,
  simpleResourceLabel
} from "@technovate/shared";

describe("simple care", () => {
  it("uses easy mode for age 65+ unless the person turns it off", () => {
    expect(shouldUseEasyMode(72, null)).toBe(true);
    expect(shouldUseEasyMode(40, null)).toBe(false);
    expect(shouldUseEasyMode(72, false)).toBe(false);
    expect(shouldUseEasyMode(40, true)).toBe(true);
  });

  it("computes age from birthday", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    expect(ageYearsFromDob("1950-01-01", now)).toBe(76);
    expect(ageYearsFromDob("2020-12-31", now)).toBe(5);
    expect(ageYearsFromDob(null, now)).toBeNull();
  });

  it("picks the first morning or afternoon slot", () => {
    const slots = [
      { startsAt: "2026-08-20T09:00:00" },
      { startsAt: "2026-08-20T14:00:00" }
    ];
    expect(pickDaypartSlot(slots, "morning")?.startsAt).toBe("2026-08-20T09:00:00");
    expect(pickDaypartSlot(slots, "afternoon")?.startsAt).toBe("2026-08-20T14:00:00");
    expect(pickDaypartSlot([{ startsAt: "2026-08-20T15:00:00" }], "morning")).toBeNull();
  });

  it("answers like a helper, not a doctor", () => {
    expect(HELPER_NAME).toBe("Helper");
    expect(HELPER_DISCLAIMER.toLowerCase()).toContain("not a real doctor");
    expect(replyForHelperQuestion("I am stuck").id).toBe("stuck");
    expect(replyForHelperQuestion("book a checkup").id).toBe("book");
    expect(replyForHelperQuestion("there was an error").id).toBe("error");
    expect(replyForHelperQuestion("chest pain emergency").id).toBe("emergency");
    expect(replyForHelperQuestion("why does my knee hurt").say.toLowerCase()).not.toContain("diagnose");
  });

  it("keeps checkup as the simple visit path and places for labs/chemo", () => {
    expect(PATIENT_NEEDS.find((n) => n.id === "checkup")?.kind).toBe("visit");
    expect(PATIENT_NEEDS.find((n) => n.id === "blood_test")?.placeQuery).toBe("Laboratory (blood test)");
    expect(PATIENT_NEEDS.find((n) => n.id === "chemo")?.placeQuery).toBe("Cancer / chemo centre");
    expect(DATA_USE_WAIVER.toLowerCase()).toContain("store");
    expect(simpleResourceLabel("Pharmacy")).toBe("Medicine store");
  });
});
