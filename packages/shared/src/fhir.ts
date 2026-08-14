/**
 * FHIR R4-shaped resources + mappers (Prompt 37).
 * HealthFlow domain remains canonical; this file is the interop boundary only.
 * Do not import Prisma or vendor SDKs here.
 */

export type FhirIdentifier = { system?: string; value: string };
export type FhirHumanName = { use?: string; family?: string; given?: string[] };
export type FhirReference = { reference: string; display?: string };
export type FhirCodeableConcept = {
  coding?: { system?: string; code?: string; display?: string }[];
  text?: string;
};
export type FhirMeta = {
  source?: string;
  lastUpdated?: string;
  versionId?: string;
  tag?: { system?: string; code?: string; display?: string }[];
};

export type FhirResourceType =
  | "Patient"
  | "Practitioner"
  | "Organization"
  | "Appointment"
  | "Encounter"
  | "Observation"
  | "Condition"
  | "Medication"
  | "MedicationRequest"
  | "DiagnosticReport"
  | "DocumentReference"
  | "CarePlan"
  | "Bundle"
  | "CapabilityStatement"
  | "OperationOutcome";

export const FHIR_RESOURCE_TYPES = [
  "Patient",
  "Practitioner",
  "Organization",
  "Appointment",
  "Encounter",
  "Observation",
  "Condition",
  "Medication",
  "MedicationRequest",
  "DiagnosticReport",
  "DocumentReference",
  "CarePlan"
] as const;

export type PriorityFhirResource = (typeof FHIR_RESOURCE_TYPES)[number];

type FhirBase = {
  resourceType: FhirResourceType;
  id?: string;
  meta?: FhirMeta;
};

export type FhirPatient = FhirBase & {
  resourceType: "Patient";
  id: string;
  identifier?: FhirIdentifier[];
  name?: FhirHumanName[];
  telecom?: { system: string; value: string }[];
  birthDate?: string;
  active?: boolean;
  managingOrganization?: FhirReference;
};

export type FhirPractitioner = FhirBase & {
  resourceType: "Practitioner";
  id: string;
  name?: FhirHumanName[];
  telecom?: { system: string; value: string }[];
  qualification?: { code?: FhirCodeableConcept }[];
};

export type FhirOrganization = FhirBase & {
  resourceType: "Organization";
  id: string;
  name?: string;
  active?: boolean;
  type?: FhirCodeableConcept[];
};

export type FhirAppointment = FhirBase & {
  resourceType: "Appointment";
  id: string;
  status: string;
  description?: string;
  start?: string;
  minutesDuration?: number;
  participant?: { actor?: FhirReference; status: string; type?: FhirCodeableConcept[] }[];
};

export type FhirEncounter = FhirBase & {
  resourceType: "Encounter";
  id: string;
  status: string;
  class: { system?: string; code: string; display?: string };
  subject?: FhirReference;
  participant?: { individual?: FhirReference }[];
  appointment?: FhirReference[];
  period?: { start?: string; end?: string };
  reasonCode?: FhirCodeableConcept[];
};

export type FhirObservation = FhirBase & {
  resourceType: "Observation";
  id: string;
  status: string;
  code: FhirCodeableConcept;
  subject?: FhirReference;
  effectiveDateTime?: string;
  valueString?: string;
  note?: { text: string }[];
};

export type FhirCondition = FhirBase & {
  resourceType: "Condition";
  id: string;
  clinicalStatus?: FhirCodeableConcept;
  code?: FhirCodeableConcept;
  subject: FhirReference;
  recordedDate?: string;
};

export type FhirMedication = FhirBase & {
  resourceType: "Medication";
  id: string;
  code?: FhirCodeableConcept;
  status?: string;
};

export type FhirMedicationRequest = FhirBase & {
  resourceType: "MedicationRequest";
  id: string;
  status: string;
  intent: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  subject: FhirReference;
  authoredOn?: string;
  requester?: FhirReference;
};

export type FhirDiagnosticReport = FhirBase & {
  resourceType: "DiagnosticReport";
  id: string;
  status: string;
  code: FhirCodeableConcept;
  subject?: FhirReference;
  effectiveDateTime?: string;
  conclusion?: string;
};

export type FhirDocumentReference = FhirBase & {
  resourceType: "DocumentReference";
  id: string;
  status: string;
  type?: FhirCodeableConcept;
  subject?: FhirReference;
  date?: string;
  description?: string;
  content: { attachment: { contentType?: string; url?: string; title?: string } }[];
};

export type FhirCarePlan = FhirBase & {
  resourceType: "CarePlan";
  id: string;
  status: string;
  intent: string;
  title?: string;
  subject: FhirReference;
  description?: string;
};

export type FhirBundle = FhirBase & {
  resourceType: "Bundle";
  type: "collection" | "searchset" | "transaction" | "document";
  timestamp?: string;
  total?: number;
  entry?: { fullUrl?: string; resource: FhirResource }[];
};

export type FhirCapabilityStatement = FhirBase & {
  resourceType: "CapabilityStatement";
  status: "active" | "draft" | "retired" | "unknown";
  date: string;
  kind: "instance" | "capability" | "requirements";
  fhirVersion: string;
  format: string[];
  rest?: {
    mode: "server" | "client";
    resource?: {
      type: string;
      interaction?: { code: string }[];
      documentation?: string;
    }[];
  }[];
};

export type FhirOperationOutcome = FhirBase & {
  resourceType: "OperationOutcome";
  issue: {
    severity: "fatal" | "error" | "warning" | "information";
    code: string;
    diagnostics?: string;
  }[];
};

export type FhirResource =
  | FhirPatient
  | FhirPractitioner
  | FhirOrganization
  | FhirAppointment
  | FhirEncounter
  | FhirObservation
  | FhirCondition
  | FhirMedication
  | FhirMedicationRequest
  | FhirDiagnosticReport
  | FhirDocumentReference
  | FhirCarePlan
  | FhirBundle
  | FhirCapabilityStatement
  | FhirOperationOutcome;

export type DomainPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  healthcareNumber?: string | null;
  dateOfBirth?: string | Date | null;
  organizationId: string;
};

export type DomainPractitioner = {
  id: string;
  firstName: string;
  lastName: string;
  specialty?: string | null;
  email?: string | null;
  organizationId: string;
};

export type DomainOrganization = {
  id: string;
  name: string;
};

export type DomainAppointment = {
  id: string;
  status: string;
  scheduledAt: string | Date;
  durationMinutes?: number | null;
  reason?: string | null;
  profileId?: string | null;
  doctorId?: string | null;
  patientName?: string;
  doctorName?: string;
  organizationId: string;
  checkedInAt?: string | Date | null;
};

const APPT_STATUS: Record<string, string> = {
  SCHEDULED: "booked",
  CONFIRMED: "booked",
  COMPLETED: "fulfilled",
  CANCELLED: "cancelled",
  RESCHEDULE_REQUESTED: "pending",
  MISSED: "noshow"
};

function isoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toFhirPatient(p: DomainPatient): FhirPatient {
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: p.healthcareNumber
      ? [{ system: "urn:healthflow:hcn", value: p.healthcareNumber }]
      : undefined,
    name: [{ use: "official", family: p.lastName, given: [p.firstName] }],
    telecom: [
      ...(p.email ? [{ system: "email", value: p.email }] : []),
      ...(p.phone ? [{ system: "phone", value: p.phone }] : [])
    ],
    birthDate: isoDate(p.dateOfBirth),
    active: true,
    managingOrganization: { reference: `Organization/${p.organizationId}` },
    meta: {
      source: `Organization/${p.organizationId}`,
      tag: [{ system: "urn:healthflow:sor", code: "PatientProfile", display: "Canonical SoR" }]
    }
  };
}

export function toFhirPractitioner(d: DomainPractitioner): FhirPractitioner {
  return {
    resourceType: "Practitioner",
    id: d.id,
    name: [{ family: d.lastName, given: [d.firstName] }],
    telecom: d.email ? [{ system: "email", value: d.email }] : undefined,
    qualification: d.specialty
      ? [{ code: { text: d.specialty } }]
      : undefined,
    meta: { source: `Organization/${d.organizationId}` }
  };
}

export function toFhirOrganization(o: DomainOrganization): FhirOrganization {
  return {
    resourceType: "Organization",
    id: o.id,
    name: o.name,
    active: true,
    type: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/organization-type",
            code: "prov",
            display: "Healthcare Provider"
          }
        ]
      }
    ],
    meta: { source: "HealthFlow" }
  };
}

export function toFhirAppointment(a: DomainAppointment): FhirAppointment {
  const start = isoDateTime(a.scheduledAt);
  const checkedIn = Boolean(a.checkedInAt);
  const status =
    checkedIn && ["CONFIRMED", "SCHEDULED"].includes(a.status)
      ? "arrived"
      : APPT_STATUS[a.status] ?? "booked";

  const participants: FhirAppointment["participant"] = [];
  if (a.profileId) {
    participants.push({
      actor: { reference: `Patient/${a.profileId}`, display: a.patientName },
      status: "accepted"
    });
  }
  if (a.doctorId) {
    participants.push({
      actor: { reference: `Practitioner/${a.doctorId}`, display: a.doctorName },
      status: "accepted",
      type: [{ text: "primary performer" }]
    });
  }

  return {
    resourceType: "Appointment",
    id: a.id,
    status,
    description: a.reason ?? undefined,
    start,
    minutesDuration: a.durationMinutes ?? undefined,
    participant: participants,
    meta: { source: `Organization/${a.organizationId}` }
  };
}

/** Encounter derived from a visit — not a separate EHR chart. */
export function toFhirEncounter(a: DomainAppointment): FhirEncounter {
  const start = isoDateTime(a.checkedInAt ?? a.scheduledAt);
  const status =
    a.status === "COMPLETED"
      ? "finished"
      : a.checkedInAt
        ? "in-progress"
        : a.status === "CANCELLED" || a.status === "MISSED"
          ? "cancelled"
          : "planned";

  return {
    resourceType: "Encounter",
    id: `enc-${a.id}`,
    status,
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
      display: "ambulatory"
    },
    subject: a.profileId
      ? { reference: `Patient/${a.profileId}`, display: a.patientName }
      : undefined,
    participant: a.doctorId
      ? [{ individual: { reference: `Practitioner/${a.doctorId}`, display: a.doctorName } }]
      : undefined,
    appointment: [{ reference: `Appointment/${a.id}` }],
    period: { start },
    reasonCode: a.reason ? [{ text: a.reason }] : undefined,
    meta: { source: `Organization/${a.organizationId}` }
  };
}

/**
 * Clinical resources not owned by HealthFlow — return OperationOutcome guidance
 * instead of inventing observations/meds.
 */
export function externalClinicalOutcome(resourceType: PriorityFhirResource): FhirOperationOutcome {
  return {
    resourceType: "OperationOutcome",
    issue: [
      {
        severity: "information",
        code: "not-supported",
        diagnostics: `${resourceType} is owned by an external clinical SoR (EHR/LIS/pharmacy). HealthFlow exposes workflow resources only; use an EHR connector adapter to fetch ${resourceType}.`
      }
    ]
  };
}

export function toFhirBundle(
  resources: FhirResource[],
  type: FhirBundle["type"] = "collection"
): FhirBundle {
  return {
    resourceType: "Bundle",
    type,
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map((resource) => ({
      fullUrl:
        resource.id && "resourceType" in resource
          ? `${resource.resourceType}/${resource.id}`
          : undefined,
      resource
    }))
  };
}

export function healthFlowCapabilityStatement(baseUrl = "/interop/fhir"): FhirCapabilityStatement {
  const readWrite = (type: string, docs: string) => ({
    type,
    interaction: [{ code: "read" }, { code: "search-type" }],
    documentation: docs
  });

  return {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString().slice(0, 10),
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["application/fhir+json", "application/json"],
    rest: [
      {
        mode: "server",
        resource: [
          readWrite("Patient", "Mapped from PatientProfile (canonical demographics)"),
          readWrite("Practitioner", "Mapped from DoctorProfile"),
          readWrite("Organization", "Clinic organization"),
          readWrite("Appointment", "Clinic scheduling"),
          readWrite("Encounter", "Derived from Appointment check-in / status"),
          {
            type: "Observation",
            interaction: [{ code: "read" }],
            documentation: "External EHR — OperationOutcome until connector configured"
          },
          {
            type: "Condition",
            interaction: [{ code: "read" }],
            documentation: "External EHR"
          },
          {
            type: "Medication",
            interaction: [{ code: "read" }],
            documentation: "External EHR / pharmacy"
          },
          {
            type: "MedicationRequest",
            interaction: [{ code: "read" }],
            documentation: "External EHR"
          },
          {
            type: "DiagnosticReport",
            interaction: [{ code: "read" }],
            documentation: "External LIS / EHR"
          },
          {
            type: "DocumentReference",
            interaction: [{ code: "read" }],
            documentation: "External document store"
          },
          {
            type: "CarePlan",
            interaction: [{ code: "read" }],
            documentation: "External care management"
          }
        ]
      }
    ],
    meta: {
      source: baseUrl,
      tag: [{ system: "urn:healthflow:interop", code: "fhir-r4-foundation", display: "Vendor-neutral adapters" }]
    }
  };
}
