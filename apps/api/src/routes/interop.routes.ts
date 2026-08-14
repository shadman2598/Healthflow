import { Router } from "express";
import type { Request } from "express";
import {
  DEFAULT_INTEROP_RETRY,
  evaluateInteropConsent,
  exportPatientEverythingBundle,
  FHIR_RESOURCE_TYPES,
  hashIdempotencyPayload,
  idParamSchema,
  interopCapability,
  resolveSyncConflict,
  withInteropRetries,
  type InteropAuthContext,
  type PriorityFhirResource
} from "@technovate/shared";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { rateLimit } from "../middleware/rate-limit";
import { assertCanViewPatientProfile } from "../lib/patient-access";
import { writeAuditLog } from "../lib/audit";
import { prisma } from "../lib/prisma";
import {
  healthFlowFhirStore,
  interopRegistry,
  readIdempotentResponse,
  storeIdempotentResponse
} from "../lib/interop-registry";

export const interopRouter = Router();

interopRouter.use(
  requireAuth,
  enrichAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "interop" })
);

type Auth = NonNullable<Request["auth"]>;

async function resolveConsentCtx(req: Request): Promise<InteropAuthContext> {
  const auth = req.auth!;
  const base: InteropAuthContext = {
    organizationId: auth.activeOrganizationId,
    userId: auth.userId,
    role: auth.role,
    privacyConsentAt: null,
    scopes: ["system/*.read"]
  };
  if (auth.role !== "PATIENT") return base;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { privacyConsentAt: true }
  });
  return { ...base, privacyConsentAt: user?.privacyConsentAt?.toISOString() ?? null };
}

async function assertResourceAccess(auth: Auth, resourceType: PriorityFhirResource, id: string): Promise<void> {
  if (resourceType === "Patient") {
    await assertCanViewPatientProfile(auth, id);
    return;
  }
  if (resourceType === "Appointment" || resourceType === "Encounter") {
    const apptId = resourceType === "Encounter" && id.startsWith("enc-") ? id.slice(4) : id;
    const appointment = await prisma.appointment.findFirst({
      where: { id: apptId, organizationId: auth.activeOrganizationId },
      include: { profile: true }
    });
    if (!appointment) throw new AppError(`${resourceType} not found`, 404);
    if (auth.role === "PATIENT") {
      if (!appointment.profileId || appointment.profile?.userId !== auth.userId) {
        throw new AppError("Forbidden", 403);
      }
    } else if (auth.role === "DOCTOR" && appointment.doctorId !== auth.doctorProfileId) {
      throw new AppError("Forbidden", 403);
    }
    return;
  }
  if (resourceType === "Practitioner" && auth.role === "PATIENT") {
    throw new AppError("Forbidden", 403);
  }
  if (resourceType === "Organization" && id !== auth.activeOrganizationId) {
    throw new AppError("Forbidden", 403);
  }
}

interopRouter.get(
  "/fhir/metadata",
  asyncHandler(async (req, res) => {
    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_EXPORTED",
      targetType: "CapabilityStatement",
      targetId: "metadata",
      ipAddress: req.ip,
      metadata: { format: "fhir-r4", resource: "CapabilityStatement" }
    });
    res.json({ resource: interopCapability() });
  })
);

interopRouter.get(
  "/connectors",
  asyncHandler(async (_req, res) => {
    res.json({
      connectors: [
        {
          id: interopRegistry.local.id,
          label: interopRegistry.local.label,
          vendor: interopRegistry.local.vendor,
          supports: interopRegistry.local.supports
        },
        ...interopRegistry.remote.map((c) => ({
          id: c.id,
          label: c.label,
          vendor: c.vendor,
          supports: c.supports
        }))
      ]
    });
  })
);

interopRouter.get(
  "/fhir/Patient/:id/$everything",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await assertCanViewPatientProfile(req.auth!, id);
    const ctx = await resolveConsentCtx(req);
    const consent = evaluateInteropConsent({
      ctx,
      resourceType: "Patient",
      patientIdentifiable: true
    });
    if (!consent.allowed) throw new AppError(consent.reason, 403, { code: consent.code });

    const { result, attempts } = await withInteropRetries(DEFAULT_INTEROP_RETRY, async () =>
      exportPatientEverythingBundle(healthFlowFhirStore, id, ctx)
    );

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_EXPORTED",
      targetType: "Bundle",
      targetId: id,
      ipAddress: req.ip,
      metadata: {
        format: "fhir-r4",
        resource: "Bundle",
        operation: "$everything",
        attempts,
        event: "interop_export"
      }
    });

    res.json({ resource: result });
  })
);

const resourceParamSchema = z.object({
  resourceType: z.enum(FHIR_RESOURCE_TYPES),
  id: z.string().min(1)
});

interopRouter.get(
  "/fhir/:resourceType/:id",
  asyncHandler(async (req, res) => {
    const started = Date.now();
    const { resourceType, id } = resourceParamSchema.parse(req.params);
    const connectorId = typeof req.query.connector === "string" ? req.query.connector : "healthflow-local";
    const connector = interopRegistry.get(connectorId) ?? interopRegistry.local;

    const ctx = await resolveConsentCtx(req);
    const consent = evaluateInteropConsent({
      ctx,
      resourceType,
      patientIdentifiable: ["Patient", "Appointment", "Encounter", "Observation", "Condition"].includes(
        resourceType
      )
    });
    if (!consent.allowed) {
      await writeAuditLog({
        organizationId: req.auth!.activeOrganizationId,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "DATA_EXPORTED",
        targetType: resourceType,
        targetId: id,
        ipAddress: req.ip,
        metadata: { denied: true, code: consent.code, event: "interop_consent_denied" }
      });
      throw new AppError(consent.reason, 403, { code: consent.code });
    }

    if (connector.id === "healthflow-local") {
      await assertResourceAccess(req.auth!, resourceType, id);
    }

    const { result, attempts } = await withInteropRetries(DEFAULT_INTEROP_RETRY, async () =>
      connector.read(resourceType, id, ctx)
    );

    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_EXPORTED",
      targetType: resourceType,
      targetId: id,
      ipAddress: req.ip,
      metadata: {
        format: "fhir-r4",
        resource: resourceType,
        connector: connector.id,
        attempts,
        latencyMs: Date.now() - started,
        event: "interop_read"
      }
    });

    res.setHeader("X-Interop-Connector", connector.id);
    res.setHeader("X-Interop-Attempts", String(attempts));
    res.json({ resource: result });
  })
);

interopRouter.post(
  "/sync/probe",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        resourceType: z.enum(FHIR_RESOURCE_TYPES),
        resourceId: z.string().min(1),
        localUpdatedAt: z.string().datetime().optional(),
        remoteUpdatedAt: z.string().datetime().optional(),
        strategy: z
          .enum(["prefer_local", "prefer_remote", "prefer_newest", "manual_review"])
          .default("prefer_local")
      })
      .parse(req.body);

    const idemKey = req.header("Idempotency-Key");
    const requestHash = hashIdempotencyPayload([body]);
    if (idemKey) {
      const cached = readIdempotentResponse(idemKey, requestHash);
      if (cached) {
        res.status(cached.status).json(cached.body);
        return;
      }
    }

    const conflict = resolveSyncConflict({
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      localUpdatedAt: body.localUpdatedAt,
      remoteUpdatedAt: body.remoteUpdatedAt,
      strategy: body.strategy
    });

    const payload = { conflict, connector: interopRegistry.local.id };
    await writeAuditLog({
      organizationId: req.auth!.activeOrganizationId,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "DATA_SHARED",
      targetType: body.resourceType,
      targetId: body.resourceId,
      source: "api:/interop/sync/probe",
      ipAddress: req.ip,
      metadata: { event: "interop_conflict_probe", conflict, connector: interopRegistry.local.id }
    });

    if (idemKey) storeIdempotentResponse(idemKey, requestHash, 200, payload);
    res.json(payload);
  })
);
