/**
 * Product positioning (Prompt 49) — final strategic insight.
 *
 * HealthFlow is not “another healthcare app.” It is clinic Healthcare OS
 * infrastructure: coordinating patient, staff, clinicians, and healthcare data
 * around the patient’s entire care journey.
 *
 * Patient adoption alone is insufficient. Real-world portal adoption is often
 * lower than study adoption; provider workload/attitudes become barriers when
 * systems add work. Every feature must eliminate unnecessary work for at least
 * one stakeholder without dumping load onto another.
 */

/** Anti-positioning — what we refuse to be marketed as. */
export const PRODUCT_ANTI_POSITIONING = [
  "another healthcare app",
  "AI doctor / diagnostic chatbot",
  "engagement / wellness feed",
  "portal that only patients love while staff drown",
  "feature checklist competing with Epic on breadth"
] as const;

/** Canonical one-line position. */
export const PRODUCT_POSITIONING =
  "A healthcare operating system that coordinates the patient, clinic staff, clinicians, and healthcare data around the patient's entire care journey.";

/**
 * North-star metric — forces product toward real stakeholder needs.
 * Prefer this over downloads, DAU, screen time, or notification volume.
 */
export const NORTH_STAR_METRIC =
  "How many minutes of unnecessary healthcare work did our platform eliminate today?";

export const NORTH_STAR_METRIC_ID = "system.minutes_unnecessary_work_eliminated" as const;

/** Evidence equation from research → infrastructure people depend on. */
export const INFRASTRUCTURE_EQUATION = [
  { factor: "Great UX", role: "Patients and low-digital-literacy users can finish the next step" },
  { factor: "Deep workflow integration", role: "Desk and clinician paths are in the visit spine, not side apps" },
  { factor: "Interoperability", role: "FHIR/API-shaped data moves with the journey, not vendor lock-in" },
  { factor: "Trust / security", role: "PHI, permissions, and audit make dependence responsible" },
  { factor: "Immediate tangible value", role: "First session confirms a visit, prep, or desk action" },
  { factor: "Automation", role: "Bureaucracy and reminders run without clinical overreach" },
  { factor: "Longitudinal continuity", role: "Same journey across before / during / after the visit" },
  { factor: "Multi-stakeholder value", role: "Patients, reception, and clinicians all save work" }
] as const;

export const INFRASTRUCTURE_EQUATION_OUTCOME =
  "Healthcare infrastructure people actually depend on";

/**
 * Conservative default minute savings per eliminated workflow event.
 * Clinics should calibrate; these are product hypotheses, not clinical claims.
 */
export const MINUTES_ELIMINATED_BY_EVENT: Partial<Record<string, number>> = {
  manual_task_eliminated: 3,
  reception_check_in: 2,
  reception_confirm_visit: 2,
  call_avoided_proxy: 5,
  appointment_conflict_blocked: 8,
  intake_gap_resolved: 4,
  intake_prep_completed: 5,
  appointment_confirmed: 3,
  clinician_documentation_drafted: 6,
  clinician_task_resolved: 4,
  follow_up_completed: 4,
  notification_suppressed: 1
};

export type Stakeholder = "patient" | "receptionist" | "clinician" | "system";

/** Warning from portal research — do not optimize patient-only. */
export const ADOPTION_WARNING =
  "Patient adoption alone is not enough. Real-world portal adoption is often considerably lower than controlled-study adoption, and provider workload or attitudes become barriers when systems add work.";

/** Sources worth keeping close (Prompt 49). */
export const STRATEGIC_SOURCES = [
  { id: "epic-mychart", label: "Epic Patient Experience / MyChart metrics" },
  { id: "zocdoc-ehr", label: "Zocdoc EHR/PMS integrations" },
  { id: "onc-fhir", label: "ONC: Hospital APIs and FHIR adoption" },
  { id: "cms-patient-access", label: "CMS Patient Access API / FHIR requirements" },
  { id: "hhs-mhealth", label: "HHS: Mobile Health App privacy/security guidance" },
  { id: "ahrq-burnout", label: "AHRQ: Physician burnout and healthcare workload" },
  { id: "portal-adoption", label: "Systematic review of patient portal adoption" },
  { id: "portal-barriers", label: "Systematic review of portal adoption barriers/facilitators" },
  { id: "mhealth-usability", label: "Systematic review of mHealth usability" },
  { id: "health-app-engagement", label: "Systematic review of health-app engagement factors" }
] as const;

export type ProductThesis = {
  positioning: string;
  antiPositioning: readonly string[];
  northStar: string;
  northStarId: typeof NORTH_STAR_METRIC_ID;
  equation: typeof INFRASTRUCTURE_EQUATION;
  equationOutcome: string;
  adoptionWarning: string;
  sources: typeof STRATEGIC_SOURCES;
};

export function productThesis(): ProductThesis {
  return {
    positioning: PRODUCT_POSITIONING,
    antiPositioning: PRODUCT_ANTI_POSITIONING,
    northStar: NORTH_STAR_METRIC,
    northStarId: NORTH_STAR_METRIC_ID,
    equation: INFRASTRUCTURE_EQUATION,
    equationOutcome: INFRASTRUCTURE_EQUATION_OUTCOME,
    adoptionWarning: ADOPTION_WARNING,
    sources: STRATEGIC_SOURCES
  };
}

/** Estimate minutes eliminated from counted workflow events (proxy for north-star). */
export function estimateMinutesEliminated(
  eventCounts: Record<string, number>
): { minutes: number; contributing: Array<{ event: string; count: number; minutes: number }> } {
  const contributing: Array<{ event: string; count: number; minutes: number }> = [];
  let minutes = 0;
  for (const [event, per] of Object.entries(MINUTES_ELIMINATED_BY_EVENT)) {
    const count = eventCounts[event] ?? 0;
    if (count <= 0 || !per) continue;
    const m = count * per;
    minutes += m;
    contributing.push({ event, count, minutes: m });
  }
  contributing.sort((a, b) => b.minutes - a.minutes);
  return { minutes, contributing };
}

/** True when a proposed primary KPI is compatible with the Healthcare OS thesis. */
export function isNorthStarCompatiblePrimary(metricId: string): boolean {
  const vanity = new Set([
    "downloads",
    "dau",
    "mau",
    "screen_time",
    "raw_click_count",
    "notification_volume",
    "session_count",
    "time_on_site",
    "dau_mau_engagement"
  ]);
  if (vanity.has(metricId)) return false;
  return (
    metricId === NORTH_STAR_METRIC_ID ||
    metricId.startsWith("desk.") ||
    metricId.startsWith("clinician.") ||
    metricId.startsWith("patient.") ||
    metricId.startsWith("system.")
  );
}
