/**
 * openFDA drug label summaries — educational reference only.
 * Never invent dosing / treatment. Fail-soft on network errors.
 */

import {
  OPENFDA_DRUG_DISCLAIMER,
  truncateLabelText,
  type DrugLabelSummary
} from "@technovate/shared";

const FETCH_TIMEOUT_MS = 10_000;
const cache = new Map<string, { expiresAt: number; labels: DrugLabelSummary[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export type DrugLabelsResult = {
  query: string;
  labels: DrugLabelSummary[];
  disclaimer: string;
  integrationNote: string;
};

type OpenFdaLabel = {
  id?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
  };
  indications_and_usage?: string[];
  warnings?: string[];
  boxed_warning?: string[];
};

type OpenFdaResponse = {
  results?: OpenFdaLabel[];
  error?: { code?: string; message?: string };
};

export async function searchOpenFdaDrugLabels(
  query: string,
  opts?: { fetchImpl?: typeof fetch; now?: number; limit?: number }
): Promise<DrugLabelsResult> {
  const q = query.trim();
  const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 10);
  const now = opts?.now ?? Date.now();
  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      query: q,
      labels: cached.labels,
      disclaimer: OPENFDA_DRUG_DISCLAIMER,
      integrationNote: "Served from cache"
    };
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  // Prefer brand/generic name match; escape quotes in query
  const safe = q.replace(/"/g, "");
  const search = encodeURIComponent(
    `openfda.brand_name:"${safe}"+OR+openfda.generic_name:"${safe}"`
  );
  const url = `https://api.fda.gov/drug/label.json?search=${search}&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "HealthFlow/1.0 (clinic-workflow; educational)" }
    });
    if (res.status === 404) {
      return empty(q, "No matching drug labels found in openFDA");
    }
    if (!res.ok) {
      return empty(q, `openFDA returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as OpenFdaResponse;
    const labels = mapLabels(body.results ?? [], safe);
    cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, labels });
    return {
      query: q,
      labels,
      disclaimer: OPENFDA_DRUG_DISCLAIMER,
      integrationNote: "Source: openFDA drug label endpoint"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return empty(q, `Drug label lookup unavailable (${msg})`);
  } finally {
    clearTimeout(timer);
  }
}

function mapLabels(results: OpenFdaLabel[], query: string): DrugLabelSummary[] {
  return results.map((r, i) => {
    const brand = r.openfda?.brand_name?.[0] ?? null;
    const generic = r.openfda?.generic_name?.[0] ?? null;
    const warningSource = r.boxed_warning?.length ? r.boxed_warning : r.warnings;
    const id = r.id ?? `openfda-${query}-${i}`;
    const display = brand ?? generic ?? query;
    return {
      id,
      brandName: brand,
      genericName: generic,
      indicationsSummary: truncateLabelText(r.indications_and_usage, 280),
      warningsSummary: truncateLabelText(warningSource, 280),
      sourceUrl: `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(
        `openfda.brand_name:"${display}"+OR+openfda.generic_name:"${display}"`
      )}&limit=1`
    };
  });
}

function empty(query: string, integrationNote: string): DrugLabelsResult {
  return {
    query,
    labels: [],
    disclaimer: OPENFDA_DRUG_DISCLAIMER,
    integrationNote
  };
}

export function clearOpenFdaCache(): void {
  cache.clear();
}
