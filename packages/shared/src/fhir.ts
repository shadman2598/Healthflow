/**
 * FHIR R4-shaped resource mappers (Prompt 37).
 * Domain model stays canonical; these adapters are interop boundary only.
 */

export type FhirIdentifier = { system?: string; value: string };
export type FhirHumanName = { family?: string; given?: string[] };
export type FhirReference = { reference: string; display?: string };

export type FhirPatient = {
  resourceType: "Patient";
  id: string;
  identifier?: FhirIdentifier[];
  name?: FhirHumanName[];
  telecom?: { system: string; value: string }[];
  birthDate?: string;
  meta?: { source?: string; lastUpdated?: string };
};

export type FhirAppointment = {
  resourceType: "Appointment";
  id: string;
  status: string;
  description?: string;
  start?: string;
  participant?: { actor?: FhirReference; status: string }[];
  meta?: { source?: string };
};

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

export type DomainAppointment = {
  id: string;
  status: string;
  scheduledAt: string | Date;
  reason?: string | null;
  profileId?: string | null;
  doctorId?: string | null;
  patientName?: string;
  doctorName?: string;
  organizationId: string;
};

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "booked",
  CONFIRMED: "arrived",
  COMPLETED: "fulfilled",
  CANCELLED: "cancelled",
  RESCHEDULE_REQUESTED: "pending",
  MISSED: "noshow"
};

export function toFhirPatient(p: DomainPatient): FhirPatient {
  const birth =
    p.dateOfBirth instanceof Date
      ? p.dateOfBirth.toISOString().slice(0, 10)
      : p.dateOfBirth
        ? String(p.dateOfBirth).slice(0, 10)
        : undefined;

  return {
    resourceType: "Patient",
    id: p.id,
    identifier: p.healthcareNumber
      ? [{ system: "urn:healthflow:hcn", value: p.healthcareNumber }]
      : undefined,
    name: [{ family: p.lastName, given: [p.firstName] }],
    telecom: [
      ...(p.email ? [{ system: "email", value: p.email }] : []),
      ...(p.phone ? [{ system: "phone", value: p.phone }] : [])
    ],
    birthDate: birth,
    meta: { source: `Organization/${p.organizationId}` }
  };
}

export function toFhirAppointment(a: DomainAppointment): FhirAppointment {
  const start = a.scheduledAt instanceof Date ? a.scheduledAt.toISOString() : a.scheduledAt;
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
      status: "accepted"
    });
  }

  return {
    resourceType: "Appointment",
    id: a.id,
    status: STATUS_MAP[a.status] ?? "booked",
    description: a.reason ?? undefined,
    start,
    participant: participants,
    meta: { source: `Organization/${a.organizationId}` }
  };
}

/** Supported FHIR resource types for future adapters. */
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

export type FhirResourceType = (typeof FHIR_RESOURCE_TYPES)[number];
