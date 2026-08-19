/**
 * Canadian public holidays via Nager.Date (no API key).
 * Fail-soft: network errors return empty + note — never block scheduling UI.
 */

import type { PublicHoliday } from "@technovate/shared";
import { PUBLIC_HOLIDAYS_DISCLAIMER } from "@technovate/shared";

type CacheEntry = { expiresAt: number; holidays: PublicHoliday[] };

const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

export type HolidaysResult = {
  year: number;
  countryCode: "CA";
  holidays: PublicHoliday[];
  disclaimer: string;
  integrationNote: string;
};

export async function fetchCanadianHolidays(
  year: number,
  opts?: { fetchImpl?: typeof fetch; now?: number }
): Promise<HolidaysResult> {
  const now = opts?.now ?? Date.now();
  const cached = cache.get(year);
  if (cached && cached.expiresAt > now) {
    return {
      year,
      countryCode: "CA",
      holidays: cached.holidays,
      disclaimer: PUBLIC_HOLIDAYS_DISCLAIMER,
      integrationNote: "Served from cache"
    };
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/CA`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "HealthFlow/1.0 (clinic-workflow)" }
    });
    if (!res.ok) {
      return emptyResult(year, `Nager.Date returned HTTP ${res.status}`);
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

    cache.set(year, { expiresAt: now + CACHE_TTL_MS, holidays });
    return {
      year,
      countryCode: "CA",
      holidays,
      disclaimer: PUBLIC_HOLIDAYS_DISCLAIMER,
      integrationNote: "Source: Nager.Date Public Holidays API"
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return emptyResult(year, `Holiday lookup unavailable (${msg})`);
  } finally {
    clearTimeout(timer);
  }
}

function emptyResult(year: number, integrationNote: string): HolidaysResult {
  return {
    year,
    countryCode: "CA",
    holidays: [],
    disclaimer: PUBLIC_HOLIDAYS_DISCLAIMER,
    integrationNote
  };
}

/** Test helper */
export function clearHolidayCache(): void {
  cache.clear();
}
