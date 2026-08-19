/**
 * Public API integrations — Nager.Date (CA holidays) + openFDA labels.
 * Reference data only: not diagnosis, prescribing, or clinical decision support.
 */

import { z } from "zod";

export const PUBLIC_HOLIDAYS_DISCLAIMER =
  "Public holidays are advisory (Nager.Date). Confirm clinic hours with your office — not all holidays close every location.";

export const OPENFDA_DRUG_DISCLAIMER =
  "Drug label summaries come from openFDA and are for education only. Not medical advice, not a formulary, and not a substitute for your clinician or pharmacist.";

export const publicHolidaySchema = z.object({
  date: z.string(),
  localName: z.string(),
  name: z.string(),
  countryCode: z.string().default("CA"),
  types: z.array(z.string()).default([])
});

export type PublicHoliday = z.infer<typeof publicHolidaySchema>;

export const drugLabelSummarySchema = z.object({
  id: z.string(),
  brandName: z.string().nullable(),
  genericName: z.string().nullable(),
  indicationsSummary: z.string().nullable(),
  warningsSummary: z.string().nullable(),
  sourceUrl: z.string().url()
});

export type DrugLabelSummary = z.infer<typeof drugLabelSummarySchema>;

export const holidaysQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional()
});

export const drugLabelsQuerySchema = z.object({
  q: z.string().trim().min(2).max(80)
});

/** Heuristic: Care Guide should fetch openFDA when the ask query looks medication-related. */
export function looksLikeMedicationQuery(q: string): boolean {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return false;
  if (
    /\b(drug|medication|medicine|pill|tablet|capsule|rx|prescription|dosage|dose|side effect|label)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // Single token that isn't a common clinic-nav word → treat as possible drug name
  const nav = /\b(sick note|reschedule|pharmacy|privacy|fee|appointment|message|login|password|hours)\b/i;
  if (nav.test(s)) return false;
  return /^[a-z][a-z0-9-]{2,40}$/i.test(s.replace(/\s+/g, ""));
}

export function truncateLabelText(value: unknown, max = 280): string | null {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value.join(" ") : String(value);
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}
