import { Router } from "express";
import { z } from "zod";
import {
  ANALYTICS_METRICS,
  ANALYTICS_VERSION,
  NORTH_STAR_METRIC,
  PRODUCT_POSITIONING,
  VANITY_METRICS_REJECTED,
  analyticsEventSchema,
  normalizeAnalyticsEventName
} from "@technovate/shared";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { requireAnyPermission } from "../middleware/require-permission";
import { writeAuditLog } from "../lib/audit";
import { AppError } from "../errors/app-error";
import { assertKnownAnalyticsEvent, loadAnalyticsDashboard } from "../lib/analytics-engine";
import { authHasPermission } from "../lib/permissions";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, enrichAuth);

analyticsRouter.post(
  "/events",
  asyncHandler(async (req, res) => {
    const body = analyticsEventSchema.parse(req.body);
    const name = normalizeAnalyticsEventName(body.name);
    if (!name || !assertKnownAnalyticsEvent(body.name)) {
      throw new AppError("Unknown analytics event", 400);
    }

    // Reject vanity-oriented event names if clients try to invent them.
    if ((VANITY_METRICS_REJECTED as readonly string[]).includes(body.name)) {
      throw new AppError("Vanity metrics are not accepted", 400);
    }

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "ANALYTICS_EVENT",
      targetType: body.resourceType ?? "Analytics",
      targetId: body.resourceId,
      source: "api:/analytics/events",
      ipAddress: req.ip,
      metadata: {
        name,
        audienceHint: ANALYTICS_METRICS.find((m) => m.events.includes(name))?.audience ?? null,
        ...(body.metadata ?? {})
      }
    });

    res.status(202).json({ ok: true, name, version: ANALYTICS_VERSION });
  })
);

analyticsRouter.get(
  "/catalog",
  asyncHandler(async (_req, res) => {
    res.json({
      version: ANALYTICS_VERSION,
      positioning: PRODUCT_POSITIONING,
      northStar: NORTH_STAR_METRIC,
      rejectedVanityMetrics: VANITY_METRICS_REJECTED,
      metrics: ANALYTICS_METRICS,
      events: ANALYTICS_METRICS.flatMap((m) => m.events)
    });
  })
);

const dashboardQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).optional()
});

analyticsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const canRead =
      authHasPermission(auth, "audit:read") ||
      authHasPermission(auth, "clinic:settings") ||
      auth.role === "RECEPTIONIST" ||
      auth.role === "DOCTOR" ||
      auth.role === "ADMIN" ||
      auth.role === "SUPER_ADMIN";
    if (!canRead) throw new AppError("Forbidden", 403);

    const q = dashboardQuery.parse(req.query);
    const dashboard = await loadAnalyticsDashboard(auth.activeOrganizationId, q.days ?? 7);

    // Patients only see patient audience strip if they somehow reach this — keep staff-focused.
    if (auth.role === "PATIENT") {
      throw new AppError("Forbidden", 403);
    }

    res.json({ dashboard });
  })
);

analyticsRouter.get(
  "/hypotheses",
  requireAnyPermission("audit:read", "clinic:settings"),
  asyncHandler(async (_req, res) => {
    res.json({
      version: ANALYTICS_VERSION,
      hypotheses: ANALYTICS_METRICS.map((m) => ({
        metricId: m.id,
        audience: m.audience,
        label: m.label,
        hypothesis: m.hypothesis,
        events: m.events
      }))
    });
  })
);
