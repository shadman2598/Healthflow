import { estimateMinutesEliminated, NORTH_STAR_METRIC, PRODUCT_POSITIONING } from "./product-positioning";

/**
 * Product analytics (Prompt 44 + 49).
 * Optimize healthcare outcomes and workflow efficiency — NOT vanity engagement.
 *
 * North-star (Prompt 49): minutes of unnecessary healthcare work eliminated.
 * Rejected primary goals: screen time, raw clicks, notification volume, sessions.
 * Allowed: outcome/efficiency signals (e.g. clicks-per-encounter as friction proxy).
 */

export const ANALYTICS_VERSION = "hf-analytics-v1";

/** Explicitly NOT primary optimization targets. */
export const VANITY_METRICS_REJECTED = [
  "screen_time",
  "raw_click_count",
  "notification_volume",
  "session_count",
  "dau_mau_engagement",
  "time_on_site"
] as const;

export type AnalyticsAudience = "patient" | "receptionist" | "clinician" | "system";

export type AnalyticsEventName =
  // Patient outcomes
  | "appointment_confirmed"
  | "appointment_completed"
  | "appointment_cancelled"
  | "appointment_missed"
  | "appointment_reschedule_requested"
  | "intake_prep_started"
  | "intake_prep_item_checked"
  | "intake_prep_completed"
  | "care_guide_completed"
  | "patient_message_response"
  | "follow_up_completed"
  | "reminder_preference_updated"
  // Receptionist efficiency
  | "reception_check_in"
  | "reception_confirm_visit"
  | "reception_mark_missed"
  | "reception_action_clicked"
  | "appointment_conflict_blocked"
  | "scheduling_booking_completed"
  | "intake_gap_resolved"
  | "manual_task_eliminated"
  | "call_avoided_proxy"
  | "desk_error_corrected"
  // Clinician efficiency
  | "clinician_prep_opened"
  | "clinician_encounter_opened"
  | "clinician_documentation_drafted"
  | "clinician_task_resolved"
  | "clinician_search_invoked"
  | "clinician_throughput_visit_closed"
  | "message_replied"
  | "message_thread_created"
  // System reliability
  | "api_error"
  | "external_dependency_timeout"
  | "integration_failure"
  | "sync_failure"
  | "notification_delivered"
  | "notification_failed"
  | "notification_suppressed"
  | "fhir_export_requested"
  | "hcn_revealed"
  | "health_check_ok"
  | "health_check_degraded";

export const ANALYTICS_EVENTS: AnalyticsEventName[] = [
  "appointment_confirmed",
  "appointment_completed",
  "appointment_cancelled",
  "appointment_missed",
  "appointment_reschedule_requested",
  "intake_prep_started",
  "intake_prep_item_checked",
  "intake_prep_completed",
  "care_guide_completed",
  "patient_message_response",
  "follow_up_completed",
  "reminder_preference_updated",
  "reception_check_in",
  "reception_confirm_visit",
  "reception_mark_missed",
  "reception_action_clicked",
  "appointment_conflict_blocked",
  "scheduling_booking_completed",
  "intake_gap_resolved",
  "manual_task_eliminated",
  "call_avoided_proxy",
  "desk_error_corrected",
  "clinician_prep_opened",
  "clinician_encounter_opened",
  "clinician_documentation_drafted",
  "clinician_task_resolved",
  "clinician_search_invoked",
  "clinician_throughput_visit_closed",
  "message_replied",
  "message_thread_created",
  "api_error",
  "external_dependency_timeout",
  "integration_failure",
  "sync_failure",
  "notification_delivered",
  "notification_failed",
  "notification_suppressed",
  "fhir_export_requested",
  "hcn_revealed",
  "health_check_ok",
  "health_check_degraded"
];

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  role?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  at?: string;
};

export type MetricDefinition = {
  id: string;
  audience: AnalyticsAudience;
  label: string;
  /** What the product believes this metric proves or disproves. */
  hypothesis: string;
  /** Events that contribute to this metric. */
  events: AnalyticsEventName[];
  unit: "count" | "rate" | "minutes" | "ms" | "clicks";
  /** Higher is better unless inverted. */
  higherIsBetter: boolean;
};

/**
 * Every dashboard metric maps to a product hypothesis (Prompt 44).
 */
export const ANALYTICS_METRICS: MetricDefinition[] = [
  // —— PATIENT ——
  {
    id: "patient.appointment_completion",
    audience: "patient",
    label: "Appointment completion",
    hypothesis:
      "Clear next-step UX + reminders increase visits completed vs cancelled/missed.",
    events: ["appointment_completed", "appointment_confirmed"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "patient.intake_completion",
    audience: "patient",
    label: "Intake / prep completion",
    hypothesis: "Care Guide prep reduces day-of friction and incomplete charts.",
    events: ["intake_prep_completed", "care_guide_completed", "intake_prep_item_checked"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "patient.missed_appointments",
    audience: "patient",
    label: "Missed appointments",
    hypothesis: "Confirmation + reminders reduce no-shows (lower is better).",
    events: ["appointment_missed"],
    unit: "count",
    higherIsBetter: false
  },
  {
    id: "patient.response_time",
    audience: "patient",
    label: "Patient message response",
    hypothesis: "Inbox routing shortens time-to-reply for patient outreach.",
    events: ["patient_message_response", "message_replied"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "patient.follow_up_completion",
    audience: "patient",
    label: "Follow-up completion",
    hypothesis: "NEXT_ACTION follow-up prompts increase completed follow-ups.",
    events: ["follow_up_completed"],
    unit: "count",
    higherIsBetter: true
  },

  // —— RECEPTIONIST ——
  {
    id: "desk.calls_avoided",
    audience: "receptionist",
    label: "Calls avoided (proxy)",
    hypothesis: "Self-serve confirm/reschedule + messaging replaces inbound phone volume.",
    events: ["call_avoided_proxy", "appointment_confirmed", "appointment_reschedule_requested"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "desk.manual_tasks_eliminated",
    audience: "receptionist",
    label: "Manual tasks eliminated",
    hypothesis: "1-click Front Desk OS actions remove re-keying and duplicate steps.",
    events: ["manual_task_eliminated", "reception_check_in", "reception_confirm_visit", "intake_gap_resolved"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "desk.scheduling_throughput",
    audience: "receptionist",
    label: "Scheduling throughput",
    hypothesis: "Conflict-aware booking reduces time-to-schedule and double-books.",
    events: ["scheduling_booking_completed", "appointment_conflict_blocked"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "desk.intake_processing",
    audience: "receptionist",
    label: "Intake processing",
    hypothesis: "Gap lanes speed intake completion before the visit.",
    events: ["intake_gap_resolved", "intake_prep_completed"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "desk.errors",
    audience: "receptionist",
    label: "Desk errors / corrections",
    hypothesis: "Provenance + validation reduce scheduling/identity errors (lower corrections needed).",
    events: ["desk_error_corrected", "appointment_conflict_blocked"],
    unit: "count",
    higherIsBetter: false
  },

  // —— CLINICIAN ——
  {
    id: "clinician.documentation_assist",
    audience: "clinician",
    label: "Documentation assistance",
    hypothesis: "AI draft notes (reviewed) cut documentation time without silent clinical decisions.",
    events: ["clinician_documentation_drafted"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "clinician.clicks_per_encounter",
    audience: "clinician",
    label: "Clicks per encounter (friction)",
    hypothesis: "Cockpit 1-click paths reduce clicks-per-encounter (efficiency, not engagement).",
    events: ["clinician_prep_opened", "clinician_encounter_opened", "reception_action_clicked"],
    unit: "clicks",
    higherIsBetter: false
  },
  {
    id: "clinician.search_friction",
    audience: "clinician",
    label: "Time searching for information",
    hypothesis: "WHO/WHY/previously/changed briefing reduces search invocations mid-visit.",
    events: ["clinician_search_invoked"],
    unit: "count",
    higherIsBetter: false
  },
  {
    id: "clinician.unresolved_tasks",
    audience: "clinician",
    label: "Unresolved → resolved tasks",
    hypothesis: "NEXT_ACTION + inbox routing increases resolved clinician tasks.",
    events: ["clinician_task_resolved", "message_replied"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "clinician.throughput",
    audience: "clinician",
    label: "Patient throughput",
    hypothesis: "Faster prep and clearer next actions increase completed visits per clinic day.",
    events: ["clinician_throughput_visit_closed", "appointment_completed"],
    unit: "count",
    higherIsBetter: true
  },

  // —— SYSTEM ——
  {
    id: "system.uptime",
    audience: "system",
    label: "Uptime / health",
    hypothesis: "Reliable API health checks correlate with clinic trust and adoption.",
    events: ["health_check_ok", "health_check_degraded"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "system.latency_errors",
    audience: "system",
    label: "Latency / API errors",
    hypothesis: "Lower error and timeout rates improve workflow completion.",
    events: ["api_error", "external_dependency_timeout"],
    unit: "count",
    higherIsBetter: false
  },
  {
    id: "system.integration_failures",
    audience: "system",
    label: "Integration failures",
    hypothesis: "Interop retries + honest SoR boundaries reduce failed clinical data pulls.",
    events: ["integration_failure", "fhir_export_requested"],
    unit: "count",
    higherIsBetter: false
  },
  {
    id: "system.sync_failures",
    audience: "system",
    label: "Synchronization failures",
    hypothesis: "Idempotent sync probes surface conflicts before silent overwrite.",
    events: ["sync_failure"],
    unit: "count",
    higherIsBetter: false
  },
  {
    id: "system.notification_delivery",
    audience: "system",
    label: "Notification delivery",
    hypothesis: "Usefulness-gated notifications improve delivery success vs mute/opt-out.",
    events: ["notification_delivered", "notification_failed", "notification_suppressed"],
    unit: "count",
    higherIsBetter: true
  },
  {
    id: "system.error_rates",
    audience: "system",
    label: "Error rates",
    hypothesis: "Tracking api_error volume enables reliability budgets before scaling clinics.",
    events: ["api_error"],
    unit: "rate",
    higherIsBetter: false
  }
];

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export function isVanityMetric(id: string): boolean {
  return (VANITY_METRICS_REJECTED as readonly string[]).includes(id);
}

export function metricsForAudience(audience: AnalyticsAudience): MetricDefinition[] {
  return ANALYTICS_METRICS.filter((m) => m.audience === audience);
}

export function metricById(id: string): MetricDefinition | undefined {
  return ANALYTICS_METRICS.find((m) => m.id === id);
}

export type AnalyticsEventCount = {
  name: string;
  count: number;
};

export type AnalyticsMetricScore = {
  id: string;
  audience: AnalyticsAudience;
  label: string;
  hypothesis: string;
  unit: MetricDefinition["unit"];
  higherIsBetter: boolean;
  value: number;
  contributingEvents: AnalyticsEventCount[];
};

export type AnalyticsDashboard = {
  version: string;
  generatedAt: string;
  windowDays: number;
  /** Prompt 49 — Healthcare OS positioning. */
  positioning: string;
  /** Prompt 49 — north-star question. */
  northStar: string;
  /** Proxy estimate of minutes eliminated in the window (calibrate per clinic). */
  estimatedMinutesEliminated: number;
  rejectedVanityMetrics: readonly string[];
  audiences: Record<
    AnalyticsAudience,
    {
      metrics: AnalyticsMetricScore[];
      headline: string;
    }
  >;
  eventTotals: AnalyticsEventCount[];
};

export function buildAnalyticsDashboard(input: {
  eventCounts: AnalyticsEventCount[];
  windowDays?: number;
  now?: Date;
}): AnalyticsDashboard {
  const byName = new Map(input.eventCounts.map((e) => [e.name, e.count]));
  const countRecord: Record<string, number> = {};
  for (const [k, v] of byName) countRecord[k] = v;
  const { minutes: estimatedMinutesEliminated } = estimateMinutesEliminated(countRecord);

  const score = (m: MetricDefinition): AnalyticsMetricScore => {
    const contributing = m.events.map((name) => ({
      name,
      count: byName.get(name) ?? 0
    }));
    const value = contributing.reduce((sum, e) => sum + e.count, 0);
    return {
      id: m.id,
      audience: m.audience,
      label: m.label,
      hypothesis: m.hypothesis,
      unit: m.unit,
      higherIsBetter: m.higherIsBetter,
      value,
      contributingEvents: contributing
    };
  };

  const patient = metricsForAudience("patient").map(score);
  const receptionist = metricsForAudience("receptionist").map(score);
  const clinician = metricsForAudience("clinician").map(score);
  const system = metricsForAudience("system").map(score);

  return {
    version: ANALYTICS_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    windowDays: input.windowDays ?? 7,
    positioning: PRODUCT_POSITIONING,
    northStar: NORTH_STAR_METRIC,
    estimatedMinutesEliminated,
    rejectedVanityMetrics: VANITY_METRICS_REJECTED,
    audiences: {
      patient: {
        metrics: patient,
        headline: "Patient outcomes: completion, intake, no-shows, response, follow-up"
      },
      receptionist: {
        metrics: receptionist,
        headline: "Front desk efficiency: calls avoided, tasks eliminated, scheduling, intake, errors"
      },
      clinician: {
        metrics: clinician,
        headline: "Clinician efficiency: docs assist, encounter friction, search, tasks, throughput"
      },
      system: {
        metrics: system,
        headline: "System reliability: uptime, latency/errors, interop, sync, notifications"
      }
    },
    eventTotals: [...input.eventCounts].sort((a, b) => b.count - a.count)
  };
}

/** Map legacy / UI event names onto the catalog where aliases exist. */
export function normalizeAnalyticsEventName(name: string): AnalyticsEventName | null {
  if (isAnalyticsEventName(name)) return name;
  const aliases: Record<string, AnalyticsEventName> = {
    appointment_updated: "appointment_confirmed",
    check_in: "reception_check_in",
    confirm: "reception_confirm_visit",
    mark_missed: "reception_mark_missed"
  };
  return aliases[name] ?? null;
}

export function assertEveryMetricHasHypothesis(): { ok: boolean; missing: string[] } {
  const missing = ANALYTICS_METRICS.filter((m) => !m.hypothesis.trim()).map((m) => m.id);
  return { ok: missing.length === 0, missing };
}
