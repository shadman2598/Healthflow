import { describe, expect, it, beforeEach } from "vitest";
import {
  looksLikeMedicationQuery,
  truncateLabelText,
  PUBLIC_HOLIDAYS_DISCLAIMER,
  OPENFDA_DRUG_DISCLAIMER
} from "@technovate/shared";
import { clearHolidayCache, fetchCanadianHolidays } from "../public-holidays";
import { clearOpenFdaCache, searchOpenFdaDrugLabels } from "../openfda-labels";

describe("public integrations (Nager.Date + openFDA)", () => {
  beforeEach(() => {
    clearHolidayCache();
    clearOpenFdaCache();
  });

  it("maps Nager.Date holiday payloads and caches", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify([
          {
            date: "2026-07-01",
            localName: "Canada Day",
            name: "Canada Day",
            countryCode: "CA",
            types: ["Public"]
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const first = await fetchCanadianHolidays(2026, { fetchImpl, now: 1_000 });
    expect(first.holidays).toHaveLength(1);
    expect(first.holidays[0]?.localName).toBe("Canada Day");
    expect(first.disclaimer).toBe(PUBLIC_HOLIDAYS_DISCLAIMER);

    const second = await fetchCanadianHolidays(2026, { fetchImpl, now: 2_000 });
    expect(second.integrationNote).toMatch(/cache/i);
    expect(calls).toBe(1);
  });

  it("fail-softs when holiday API is down", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("network down");
    };
    const res = await fetchCanadianHolidays(2026, { fetchImpl });
    expect(res.holidays).toEqual([]);
    expect(res.integrationNote).toMatch(/unavailable/i);
  });

  it("maps openFDA labels without inventing dosing", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "label-1",
              openfda: { brand_name: ["Advil"], generic_name: ["IBUPROFEN"] },
              indications_and_usage: ["For temporary relief of minor aches."],
              warnings: ["Do not use if allergic to ibuprofen."]
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const res = await searchOpenFdaDrugLabels("advil", { fetchImpl });
    expect(res.labels).toHaveLength(1);
    expect(res.labels[0]?.brandName).toBe("Advil");
    expect(res.labels[0]?.indicationsSummary).toMatch(/temporary relief/i);
    expect(res.disclaimer).toBe(OPENFDA_DRUG_DISCLAIMER);
    expect(JSON.stringify(res.labels)).not.toMatch(/take \d+ mg/i);
  });

  it("returns empty labels on openFDA 404", async () => {
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 404 });
    const res = await searchOpenFdaDrugLabels("zzzznotadrug", { fetchImpl });
    expect(res.labels).toEqual([]);
  });

  it("detects medication-like Care Guide queries", () => {
    expect(looksLikeMedicationQuery("advil")).toBe(true);
    expect(looksLikeMedicationQuery("ibuprofen side effects")).toBe(true);
    expect(looksLikeMedicationQuery("reschedule")).toBe(false);
    expect(looksLikeMedicationQuery("sick note")).toBe(false);
  });

  it("truncates long label text", () => {
    const long = "a".repeat(400);
    expect(truncateLabelText(long, 50)?.length).toBe(50);
    expect(truncateLabelText(["One", "Two"])).toBe("One Two");
  });
});
