/**
 * Vendor-neutral interoperability foundation (Prompt 37).
 * Core app talks to InteropAdapter — never to a specific EHR SDK.
 */

import {
  externalClinicalOutcome,
  FHIR_RESOURCE_TYPES,
  healthFlowCapabilityStatement,
  toFhirAppointment,
  toFhirBundle,
  toFhirEncounter,
  toFhirOrganization,
  toFhirPatient,
  toFhirPractitioner,
  type DomainAppointment,
  type DomainOrganization,
  type DomainPatient,
  type DomainPractitioner,
  type FhirResource,
  type FhirResourceType,
  type PriorityFhirResource
} from "./fhir";

export type InteropAuthContext = {
  organizationId: string;
  userId: string;
  role: string;
  /** Patient portal consent timestamp ISO, if any. */
  privacyConsentAt?: string | null;
  scopes?: string[];
};

export type InteropConsentDecision =
  | { allowed: true }
  | { allowed: false; reason: string; code: "CONSENT_REQUIRED" | "SCOPE_DENIED" | "ROLE_DENIED" };

export type SyncDirection = "export" | "import" | "bidirectional";

export type SyncConflictStrategy =
  | "prefer_local"
  | "prefer_remote"
  | "prefer_newest"
  | "manual_review";

export type SyncConflict = {
  resourceType: string;
  resourceId: string;
  localVersion?: string;
  remoteVersion?: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  strategy: SyncConflictStrategy;
  resolution: "kept_local" | "kept_remote" | "needs_review";
  reason: string;
};

export type IdempotencyRecord = {
  key: string;
  requestHash: string;
  responseStatus: number;
  createdAt: string;
  expiresAt: string;
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn: number[];
};

export const DEFAULT_INTEROP_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  retryOn: [408, 429, 500, 502, 503, 504]
};

export type InteropMonitorEvent = {
  name:
    | "interop_read"
    | "interop_export"
    | "interop_sync"
    | "interop_conflict"
    | "interop_retry"
    | "interop_rate_limited"
    | "interop_consent_denied";
  resourceType?: string;
  resourceId?: string;
  connectorId?: string;
  latencyMs?: number;
  ok: boolean;
  detail?: string;
};

/** Pluggable connector — Epic/Cerner/etc. implement this without touching domain routes. */
export type InteropConnector = {
  id: string;
  label: string;
  vendor: string;
  supports: PriorityFhirResource[];
  read(resourceType: PriorityFhirResource, id: string, ctx: InteropAuthContext): Promise<FhirResource>;
  search?(
    resourceType: PriorityFhirResource,
    params: Record<string, string>,
    ctx: InteropAuthContext
  ): Promise<FhirResource>;
};

export type LocalFhirStore = {
  getPatient(id: string, orgId: string): Promise<DomainPatient | null>;
  getPractitioner(id: string, orgId: string): Promise<DomainPractitioner | null>;
  getOrganization(id: string): Promise<DomainOrganization | null>;
  getAppointment(id: string, orgId: string): Promise<DomainAppointment | null>;
  listAppointmentsForPatient?(profileId: string, orgId: string): Promise<DomainAppointment[]>;
};

export function evaluateInteropConsent(input: {
  ctx: InteropAuthContext;
  resourceType: FhirResourceType;
  /** Export of patient-identifiable data requires consent for PATIENT actors. */
  patientIdentifiable: boolean;
}): InteropConsentDecision {
  const { ctx, patientIdentifiable } = input;
  if (!patientIdentifiable) return { allowed: true };

  if (ctx.role === "PATIENT") {
    if (!ctx.privacyConsentAt) {
      return {
        allowed: false,
        reason: "Privacy consent required before exporting identifiable FHIR resources",
        code: "CONSENT_REQUIRED"
      };
    }
    return { allowed: true };
  }

  // Staff exports are authorized via RBAC at the route layer; consent is clinic policy.
  return { allowed: true };
}

export function resolveSyncConflict(input: {
  resourceType: string;
  resourceId: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  localVersion?: string;
  remoteVersion?: string;
  strategy: SyncConflictStrategy;
}): SyncConflict {
  const base = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    localVersion: input.localVersion,
    remoteVersion: input.remoteVersion,
    localUpdatedAt: input.localUpdatedAt,
    remoteUpdatedAt: input.remoteUpdatedAt,
    strategy: input.strategy
  };

  if (input.strategy === "manual_review") {
    return { ...base, resolution: "needs_review", reason: "Manual review required for clinical conflict" };
  }
  if (input.strategy === "prefer_local") {
    return { ...base, resolution: "kept_local", reason: "Policy prefers HealthFlow canonical SoR" };
  }
  if (input.strategy === "prefer_remote") {
    return { ...base, resolution: "kept_remote", reason: "Policy prefers remote EHR value" };
  }

  const localTs = input.localUpdatedAt ? Date.parse(input.localUpdatedAt) : 0;
  const remoteTs = input.remoteUpdatedAt ? Date.parse(input.remoteUpdatedAt) : 0;
  if (remoteTs > localTs) {
    return { ...base, resolution: "kept_remote", reason: "Remote resource is newer" };
  }
  return { ...base, resolution: "kept_local", reason: "Local resource is newer or equal" };
}

export function computeIdempotencyExpiry(now = new Date(), ttlHours = 24): string {
  return new Date(now.getTime() + ttlHours * 3600_000).toISOString();
}

export function hashIdempotencyPayload(parts: unknown[]): string {
  // Stable, non-crypto fingerprint for demo/tests — production should use SHA-256.
  const raw = JSON.stringify(parts);
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `idem_${Math.abs(h).toString(16)}`;
}

export async function withInteropRetries<T>(
  policy: RetryPolicy,
  operation: (attempt: number) => Promise<T>,
  isRetryable?: (error: unknown) => boolean
): Promise<{ result: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const result = await operation(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = isRetryable
        ? isRetryable(error)
        : typeof error === "object" &&
          error !== null &&
          "status" in error &&
          policy.retryOn.includes(Number((error as { status: number }).status));
      if (!retryable || attempt >= policy.maxAttempts) break;
      const delay = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * HealthFlow local adapter — maps canonical domain → FHIR without vendor lock-in.
 */
export function createHealthFlowAdapter(store: LocalFhirStore): InteropConnector {
  return {
    id: "healthflow-local",
    label: "HealthFlow local SoR",
    vendor: "HealthFlow",
    supports: [...FHIR_RESOURCE_TYPES],
    async read(resourceType, id, ctx) {
      switch (resourceType) {
        case "Patient": {
          const p = await store.getPatient(id, ctx.organizationId);
          if (!p) throw Object.assign(new Error("Patient not found"), { status: 404 });
          return toFhirPatient(p);
        }
        case "Practitioner": {
          const d = await store.getPractitioner(id, ctx.organizationId);
          if (!d) throw Object.assign(new Error("Practitioner not found"), { status: 404 });
          return toFhirPractitioner(d);
        }
        case "Organization": {
          const o = await store.getOrganization(id);
          if (!o || o.id !== ctx.organizationId) {
            throw Object.assign(new Error("Organization not found"), { status: 404 });
          }
          return toFhirOrganization(o);
        }
        case "Appointment": {
          const a = await store.getAppointment(id, ctx.organizationId);
          if (!a) throw Object.assign(new Error("Appointment not found"), { status: 404 });
          return toFhirAppointment(a);
        }
        case "Encounter": {
          const apptId = id.startsWith("enc-") ? id.slice(4) : id;
          const a = await store.getAppointment(apptId, ctx.organizationId);
          if (!a) throw Object.assign(new Error("Encounter not found"), { status: 404 });
          return toFhirEncounter(a);
        }
        case "Observation":
        case "Condition":
        case "Medication":
        case "MedicationRequest":
        case "DiagnosticReport":
        case "DocumentReference":
        case "CarePlan":
          return externalClinicalOutcome(resourceType);
        default:
          throw Object.assign(new Error(`Unsupported type ${resourceType}`), { status: 400 });
      }
    }
  };
}

/** Stub EHR connector — demonstrates swap-in without rewriting core routes. */
export function createEhrConnectorStub(vendor: string): InteropConnector {
  return {
    id: `ehr-stub-${vendor.toLowerCase().replace(/\s+/g, "-")}`,
    label: `${vendor} stub connector`,
    vendor,
    supports: [...FHIR_RESOURCE_TYPES],
    async read(resourceType) {
      if (
        resourceType === "Observation" ||
        resourceType === "Condition" ||
        resourceType === "Medication" ||
        resourceType === "MedicationRequest" ||
        resourceType === "DiagnosticReport" ||
        resourceType === "DocumentReference" ||
        resourceType === "CarePlan"
      ) {
        return {
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "information",
              code: "not-found",
              diagnostics: `${vendor} connector not configured — register credentials to fetch ${resourceType}`
            }
          ]
        };
      }
      return {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "warning",
            code: "transient",
            diagnostics: `${vendor} stub does not mirror workflow resources; use healthflow-local adapter`
          }
        ]
      };
    }
  };
}

export type ConnectorRegistry = {
  local: InteropConnector;
  remote: InteropConnector[];
  get(id: string): InteropConnector | undefined;
};

export function createConnectorRegistry(local: InteropConnector, remote: InteropConnector[] = []): ConnectorRegistry {
  const all = [local, ...remote];
  return {
    local,
    remote,
    get(id: string) {
      return all.find((c) => c.id === id);
    }
  };
}

export async function exportPatientEverythingBundle(
  store: LocalFhirStore,
  profileId: string,
  ctx: InteropAuthContext
): Promise<FhirResource> {
  const patient = await store.getPatient(profileId, ctx.organizationId);
  if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

  const org = await store.getOrganization(ctx.organizationId);
  const appointments = store.listAppointmentsForPatient
    ? await store.listAppointmentsForPatient(profileId, ctx.organizationId)
    : [];

  const resources: FhirResource[] = [toFhirPatient(patient)];
  if (org) resources.push(toFhirOrganization(org));
  for (const a of appointments.slice(0, 20)) {
    resources.push(toFhirAppointment(a));
    resources.push(toFhirEncounter(a));
  }

  return toFhirBundle(resources, "collection");
}

export function interopCapability(): FhirResource {
  return healthFlowCapabilityStatement();
}

export { FHIR_RESOURCE_TYPES, healthFlowCapabilityStatement };
