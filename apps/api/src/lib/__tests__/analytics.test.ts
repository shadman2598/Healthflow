import { describe, expect, it } from "vitest";
import {
  ANALYTICS_METRICS,
  VANITY_METRICS_REJECTED,
  assertEveryMetricHasHypothesis,
  buildAnalyticsDashboard,
  isAnalyticsEventName,
  isVanityMetric,
  metricsForAudience,
  normalizeAnalyticsEventName
} from "@technovate/shared";

describe("analytics outcomes catalog (Prompt 44)", () => {
  it("rejects vanity primary metrics", () => {
    expect(VANITY_METRICS_REJECTED).toContain("screen_time");
    expect(VANITY_METRICS_REJECTED).toContain("notification_volume");
    expect(VANITY_METRICS_REJECTED).toContain("session_count");
    expect(isVanityMetric("raw_click_count")).toBe(true);
    expect(ANALYTICS_METRICS.every((m) => !isVanityMetric(m.id))).toBe(true);
  });

  it("covers patient, receptionist, clinician, and system audiences", () => {
    expect(metricsForAudience("patient").length).toBeGreaterThanOrEqual(5);
    expect(metricsForAudience("receptionist").length).toBeGreaterThanOrEqual(5);
    expect(metricsForAudience("clinician").length).toBeGreaterThanOrEqual(5);
    expect(metricsForAudience("system").length).toBeGreaterThanOrEqual(5);
  });

  it("maps every metric to a product hypothesis", () => {
    const result = assertEveryMetricHasHypothesis();
    expect(result.ok).toBe(true);
    for (const m of ANALYTICS_METRICS) {
      expect(m.hypothesis.length).toBeGreaterThan(20);
      expect(m.events.length).toBeGreaterThan(0);
    }
  });

  it("normalizes desk aliases and builds dashboard scores", () => {
    expect(normalizeAnalyticsEventName("check_in")).toBe("reception_check_in");
    expect(isAnalyticsEventName("appointment_completed")).toBe(true);

    const dashboard = buildAnalyticsDashboard({
      windowDays: 7,
      eventCounts: [
        { name: "appointment_completed", count: 12 },
        { name: "appointment_missed", count: 2 },
        { name: "reception_check_in", count: 9 },
        { name: "manual_task_eliminated", count: 9 },
        { name: "clinician_prep_opened", count: 8 },
        { name: "api_error", count: 1 },
        { name: "notification_delivered", count: 20 }
      ]
    });

    expect(dashboard.rejectedVanityMetrics).toContain("screen_time");
    expect(dashboard.northStar.toLowerCase()).toContain("minutes");
    expect(dashboard.estimatedMinutesEliminated).toBeGreaterThan(0);
    expect(dashboard.positioning.toLowerCase()).toContain("operating system");
    const patientCompletion = dashboard.audiences.patient.metrics.find(
      (m) => m.id === "patient.appointment_completion"
    );
    expect(patientCompletion?.value).toBe(12);
    expect(patientCompletion?.hypothesis).toMatch(/reminders|next-step/i);

    const missed = dashboard.audiences.patient.metrics.find((m) => m.id === "patient.missed_appointments");
    expect(missed?.higherIsBetter).toBe(false);
    expect(missed?.value).toBe(2);

    const desk = dashboard.audiences.receptionist.metrics.find(
      (m) => m.id === "desk.manual_tasks_eliminated"
    );
    expect((desk?.value ?? 0) >= 9).toBe(true);
  });
});
