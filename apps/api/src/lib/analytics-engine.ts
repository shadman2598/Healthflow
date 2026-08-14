import {
  buildAnalyticsDashboard,
  isAnalyticsEventName,
  normalizeAnalyticsEventName,
  type AnalyticsEventCount
} from "@technovate/shared";
import { prisma } from "./prisma";

/**
 * Aggregate ANALYTICS_EVENT audit rows (+ a few operational audit proxies) into dashboard scores.
 */
export async function loadAnalyticsDashboard(organizationId: string, windowDays = 7) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
      OR: [
        { action: "ANALYTICS_EVENT" },
        { action: { in: ["DATA_EXPORTED", "AI_FAILED", "AI_BLOCKED", "APPOINTMENT_CREATED", "APPOINTMENT_UPDATED", "APPOINTMENT_DELETED"] } }
      ]
    },
    select: { action: true, metadata: true },
    take: 5000
  });

  const counts = new Map<string, number>();
  const bump = (name: string, n = 1) => counts.set(name, (counts.get(name) ?? 0) + n);

  for (const row of rows) {
    if (row.action === "ANALYTICS_EVENT") {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const raw = typeof meta.name === "string" ? meta.name : "";
      const name = normalizeAnalyticsEventName(raw);
      if (name) bump(name);
      continue;
    }

    // Operational proxies when clients have not yet emitted a dedicated analytics event.
    if (row.action === "DATA_EXPORTED") bump("fhir_export_requested");
    if (row.action === "AI_FAILED" || row.action === "AI_BLOCKED") bump("integration_failure");
    if (row.action === "APPOINTMENT_CREATED") bump("scheduling_booking_completed");
    if (row.action === "APPOINTMENT_DELETED") bump("appointment_cancelled");
    if (row.action === "APPOINTMENT_UPDATED") {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const status = typeof meta.status === "string" ? meta.status : "";
      if (status === "MISSED") bump("appointment_missed");
      else if (status === "COMPLETED") bump("appointment_completed");
      else if (status === "CONFIRMED") bump("appointment_confirmed");
      else if (status === "RESCHEDULE_REQUESTED") bump("appointment_reschedule_requested");
    }
  }

  // Lightweight system heartbeat for the window (process-local; not a full SRE stack).
  bump("health_check_ok");

  const eventCounts: AnalyticsEventCount[] = [...counts.entries()].map(([name, count]) => ({
    name,
    count
  }));

  return buildAnalyticsDashboard({ eventCounts, windowDays });
}

export function assertKnownAnalyticsEvent(name: string): boolean {
  return isAnalyticsEventName(name) || Boolean(normalizeAnalyticsEventName(name));
}
