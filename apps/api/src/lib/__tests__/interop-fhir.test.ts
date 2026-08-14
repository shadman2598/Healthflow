import { describe, expect, it } from "vitest";
import {
  createConnectorRegistry,
  createEhrConnectorStub,
  createHealthFlowAdapter,
  evaluateInteropConsent,
  exportPatientEverythingBundle,
  hashIdempotencyPayload,
  healthFlowCapabilityStatement,
  resolveSyncConflict,
  toFhirEncounter,
  toFhirOrganization,
  toFhirPractitioner,
  withInteropRetries,
  type LocalFhirStore
} from "@technovate/shared";

function memoryStore(): LocalFhirStore {
  const patient = {
    id: "p1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@clinic.test",
    phone: "555-0100",
    healthcareNumber: "HCN-ADA",
    dateOfBirth: "1815-12-10",
    organizationId: "org1"
  };
  const doctor = {
    id: "d1",
    firstName: "Grace",
    lastName: "Hopper",
    specialty: "Family Medicine",
    email: "grace@clinic.test",
    organizationId: "org1"
  };
  const org = { id: "org1", name: "HealthFlow Demo Clinic" };
  const appt = {
    id: "a1",
    status: "CONFIRMED",
    scheduledAt: "2026-06-01T15:00:00.000Z",
    durationMinutes: 30,
    reason: "BP follow-up",
    profileId: "p1",
    doctorId: "d1",
    patientName: "Ada Lovelace",
    doctorName: "Dr. Grace Hopper",
    organizationId: "org1",
    checkedInAt: "2026-06-01T14:50:00.000Z"
  };

  return {
    getPatient: async (id, orgId) => (id === patient.id && orgId === org.id ? patient : null),
    getPractitioner: async (id, orgId) => (id === doctor.id && orgId === org.id ? doctor : null),
    getOrganization: async (id) => (id === org.id ? org : null),
    getAppointment: async (id, orgId) => (id === appt.id && orgId === org.id ? appt : null),
    listAppointmentsForPatient: async (profileId, orgId) =>
      profileId === "p1" && orgId === org.id ? [appt] : []
  };
}

describe("FHIR interop foundation", () => {
  it("publishes a CapabilityStatement covering priority resources", () => {
    const cap = healthFlowCapabilityStatement();
    expect(cap.resourceType).toBe("CapabilityStatement");
    expect(cap.fhirVersion).toBe("4.0.1");
    const types = cap.rest?.[0]?.resource?.map((r) => r.type) ?? [];
    expect(types).toEqual(
      expect.arrayContaining([
        "Patient",
        "Practitioner",
        "Organization",
        "Appointment",
        "Encounter",
        "Observation",
        "MedicationRequest",
        "DiagnosticReport",
        "CarePlan"
      ])
    );
  });

  it("maps Practitioner, Organization, and Encounter without vendor coupling", () => {
    expect(
      toFhirPractitioner({
        id: "d1",
        firstName: "Grace",
        lastName: "Hopper",
        specialty: "Family Medicine",
        organizationId: "org1"
      }).resourceType
    ).toBe("Practitioner");

    expect(toFhirOrganization({ id: "org1", name: "Demo Clinic" }).name).toBe("Demo Clinic");

    const enc = toFhirEncounter({
      id: "a1",
      status: "CONFIRMED",
      scheduledAt: "2026-06-01T15:00:00.000Z",
      checkedInAt: "2026-06-01T14:50:00.000Z",
      profileId: "p1",
      doctorId: "d1",
      organizationId: "org1",
      reason: "BP follow-up"
    });
    expect(enc.resourceType).toBe("Encounter");
    expect(enc.status).toBe("in-progress");
    expect(enc.appointment?.[0]?.reference).toBe("Appointment/a1");
  });

  it("requires patient consent before identifiable export", () => {
    const denied = evaluateInteropConsent({
      ctx: {
        organizationId: "org1",
        userId: "u1",
        role: "PATIENT",
        privacyConsentAt: null
      },
      resourceType: "Patient",
      patientIdentifiable: true
    });
    expect(denied.allowed).toBe(false);

    const ok = evaluateInteropConsent({
      ctx: {
        organizationId: "org1",
        userId: "u1",
        role: "PATIENT",
        privacyConsentAt: "2026-01-01T00:00:00.000Z"
      },
      resourceType: "Patient",
      patientIdentifiable: true
    });
    expect(ok.allowed).toBe(true);
  });

  it("resolves sync conflicts with prefer_local for HealthFlow canonical SoR", () => {
    const conflict = resolveSyncConflict({
      resourceType: "Patient",
      resourceId: "p1",
      localUpdatedAt: "2026-06-01T10:00:00.000Z",
      remoteUpdatedAt: "2026-06-02T10:00:00.000Z",
      strategy: "prefer_local"
    });
    expect(conflict.resolution).toBe("kept_local");
  });

  it("prefers newest when configured", () => {
    const conflict = resolveSyncConflict({
      resourceType: "Appointment",
      resourceId: "a1",
      localUpdatedAt: "2026-06-01T10:00:00.000Z",
      remoteUpdatedAt: "2026-06-02T10:00:00.000Z",
      strategy: "prefer_newest"
    });
    expect(conflict.resolution).toBe("kept_remote");
  });

  it("retries transient failures then succeeds", async () => {
    let tries = 0;
    const { result, attempts } = await withInteropRetries(
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, retryOn: [503] },
      async () => {
        tries += 1;
        if (tries < 3) throw Object.assign(new Error("down"), { status: 503 });
        return "ok";
      }
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("exports Patient $everything bundle from local adapter", async () => {
    const store = memoryStore();
    const adapter = createHealthFlowAdapter(store);
    const registry = createConnectorRegistry(adapter, [createEhrConnectorStub("Epic")]);

    const patient = await registry.local.read("Patient", "p1", {
      organizationId: "org1",
      userId: "staff",
      role: "RECEPTIONIST"
    });
    expect(patient.resourceType).toBe("Patient");

    const meds = await registry.get("ehr-stub-epic")!.read("MedicationRequest", "x", {
      organizationId: "org1",
      userId: "staff",
      role: "DOCTOR"
    });
    expect(meds.resourceType).toBe("OperationOutcome");

    const bundle = await exportPatientEverythingBundle(store, "p1", {
      organizationId: "org1",
      userId: "staff",
      role: "RECEPTIONIST"
    });
    expect(bundle.resourceType).toBe("Bundle");
    if (bundle.resourceType === "Bundle") {
      const types = bundle.entry?.map((e) => e.resource.resourceType) ?? [];
      expect(types).toEqual(expect.arrayContaining(["Patient", "Organization", "Appointment", "Encounter"]));
    }
  });

  it("fingerprints idempotency payloads stably", () => {
    const a = hashIdempotencyPayload([{ id: "1", strategy: "prefer_local" }]);
    const b = hashIdempotencyPayload([{ id: "1", strategy: "prefer_local" }]);
    const c = hashIdempotencyPayload([{ id: "1", strategy: "prefer_remote" }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("returns OperationOutcome for clinical resources on local adapter", async () => {
    const adapter = createHealthFlowAdapter(memoryStore());
    const obs = await adapter.read("Observation", "obs1", {
      organizationId: "org1",
      userId: "d1",
      role: "DOCTOR"
    });
    expect(obs.resourceType).toBe("OperationOutcome");
  });
});
