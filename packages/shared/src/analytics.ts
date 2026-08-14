/**
 * Product analytics event catalog (Prompt 44).
 * Optimize outcomes / workflow efficiency — not screen time.
 */

export const ANALYTICS_EVENTS = [
  "appointment_confirmed",
  "appointment_cancelled",
  "appointment_reschedule_requested",
  "appointment_conflict_blocked",
  "intake_prep_item_checked",
  "message_thread_created",
  "message_replied",
  "reminder_preference_updated",
  "hcn_revealed",
  "reception_action_clicked",
  "clinician_prep_opened",
  "care_guide_completed",
  "fhir_export_requested",
  "api_error",
  "external_dependency_timeout"
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  role?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  at?: string;
};

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}
