/**
 * Browser-side public integrations for GitHub Pages (no Express).
 * Same contracts as the API adapters — education/advisory only.
 */

import {
  OPENFDA_DRUG_DISCLAIMER,
  PUBLIC_HOLIDAYS_DISCLAIMER,
  truncateLabelText,
  type DrugLabelSummary,
  type PublicHoliday
} from "@technovate/shared";

export type ClientHolidaysResult = {
  year: number;
  countryCode: "CA";
  holidays: PublicHoliday[];
  disclaimer: string;
  integrationNote: string;
};

export type ClientDrugLabelsResult = {
  query: string;
  labels: DrugLabelSummary[];
  disclaimer: string;
  integrationNote: string;
};

export async function fetchCanadianHolidaysClient(year: number): Promise<ClientHolidaysResult> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CA`, {
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      return emptyHolidays(year, `Nager.Date returned HTTP ${res.status}`);
    }
    const raw = (await res.json()) as Array<{
      date?: string;
      localName?: string;
      name?: string;
      countryCode?: string;
      types?: string[];
    }>;
    const holidays: PublicHoliday[] = (Array.isArray(raw) ? raw : [])
      .filter((h) => typeof h.date === "string" && (h.localName || h.name))
      .map((h) => ({
        date: h.date!,
        localName: String(h.localName ?? h.name),
        name: String(h.name ?? h.localName),
        countryCode: String(h.countryCode ?? "CA"),
        types: Array.isArray(h.types) ? h.types.map(String) : []
      }));
    return {
      year,
      countryCode: "CA",
      holidays,
      disclaimer: PUBLIC_HOLIDAYS_DISCLAIMER,
      integrationNote: "Source: Nager.Date (browser)"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return emptyHolidays(year, `Holiday lookup unavailable (${msg})`);
  }
}

export async function searchOpenFdaDrugLabelsClient(query: string): Promise<ClientDrugLabelsResult> {
  const q = query.trim();
  const safe = q.replace(/"/g, "");
  const search = encodeURIComponent(
    `openfda.brand_name:"${safe}"+OR+openfda.generic_name:"${safe}"`
  );
  try {
    const res = await fetch(`https://api.fda.gov/drug/label.json?search=${search}&limit=5`, {
      headers: { Accept: "application/json" }
    });
    if (res.status === 404) {
      return emptyLabels(q, "No matching drug labels found in openFDA");
    }
    if (!res.ok) {
      return emptyLabels(q, `openFDA returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      results?: Array<{
        id?: string;
        openfda?: { brand_name?: string[]; generic_name?: string[] };
        indications_and_usage?: string[];
        warnings?: string[];
        boxed_warning?: string[];
      }>;
    };
    const labels: DrugLabelSummary[] = (body.results ?? []).map((r, i) => {
      const brand = r.openfda?.brand_name?.[0] ?? null;
      const generic = r.openfda?.generic_name?.[0] ?? null;
      const warningSource = r.boxed_warning?.length ? r.boxed_warning : r.warnings;
      const display = brand ?? generic ?? safe;
      return {
        id: r.id ?? `openfda-${safe}-${i}`,
        brandName: brand,
        genericName: generic,
        indicationsSummary: truncateLabelText(r.indications_and_usage, 280),
        warningsSummary: truncateLabelText(warningSource, 280),
        sourceUrl: `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(
          `openfda.brand_name:"${display}"+OR+openfda.generic_name:"${display}"`
        )}&limit=1`
      };
    });
    return {
      query: q,
      labels,
      disclaimer: OPENFDA_DRUG_DISCLAIMER,
      integrationNote: "Source: openFDA (browser)"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return emptyLabels(q, `Drug label lookup unavailable (${msg})`);
  }
}

function emptyHolidays(year: number, integrationNote: string): ClientHolidaysResult {
  return {
    year,
    countryCode: "CA",
    holidays: [],
    disclaimer: PUBLIC_HOLIDAYS_DISCLAIMER,
    integrationNote
  };
}

function emptyLabels(query: string, integrationNote: string): ClientDrugLabelsResult {
  return {
    query,
    labels: [],
    disclaimer: OPENFDA_DRUG_DISCLAIMER,
    integrationNote
  };
}
