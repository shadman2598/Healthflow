import {
  demographicsMirrorPatch,
  mergeCanonicalField,
  roleToProvenanceSource,
  type DataProvenance,
  type MergeDecision
} from "@technovate/shared";
import { AppError } from "../errors/app-error";

export type AppointmentNoteMergeInput = {
  appointmentId: string;
  actorRole?: string;
  existingReason: string | null;
  existingPatientNotes: string | null;
  existingStaffNotes: string | null;
  proposedReason?: string | null;
  proposedPatientNotes?: string | null;
  proposedStaffNotes?: string | null;
  allowOverwriteReason?: boolean;
  allowOverwritePatientNotes?: boolean;
};

/**
 * Merge appointment narrative fields without silently clobbering patient-provided text.
 */
export function mergeAppointmentNarratives(input: AppointmentNoteMergeInput): {
  reason?: string | null;
  patientNotes?: string | null;
  staffNotes?: string | null;
  provenance: DataProvenance[];
} {
  const provenance: DataProvenance[] = [];
  const out: {
    reason?: string | null;
    patientNotes?: string | null;
    staffNotes?: string | null;
  } = {};

  const failConflict = (d: Extract<MergeDecision, { action: "conflict" }>): never => {
    throw new AppError(d.reason, 409, {
      code: "PROVENANCE_CONFLICT",
      field: d.provenance.field,
      existing: d.existing,
      proposed: d.proposed
    });
  };

  if (input.proposedReason !== undefined) {
    const d = mergeCanonicalField({
      fieldKey: "appointment.reason",
      existing: input.existingReason,
      proposed: input.proposedReason,
      actorRole: input.actorRole,
      resourceType: "Appointment",
      resourceId: input.appointmentId,
      allowOverwrite: input.allowOverwriteReason
    });
    provenance.push(d.provenance);
    if (d.action === "conflict") failConflict(d);
    if (d.action === "accept") out.reason = d.nextValue;
  }

  if (input.proposedPatientNotes !== undefined) {
    const d = mergeCanonicalField({
      fieldKey: "appointment.patientNotes",
      existing: input.existingPatientNotes,
      proposed: input.proposedPatientNotes,
      actorRole: input.actorRole,
      source:
        input.actorRole === "PATIENT" ? "patient_provided" : roleToProvenanceSource(input.actorRole),
      resourceType: "Appointment",
      resourceId: input.appointmentId,
      allowOverwrite: input.allowOverwritePatientNotes
    });
    provenance.push(d.provenance);
    if (d.action === "conflict") failConflict(d);
    if (d.action === "accept") out.patientNotes = d.nextValue;
  }

  if (input.proposedStaffNotes !== undefined) {
    const d = mergeCanonicalField({
      fieldKey: "appointment.staffNotes",
      existing: input.existingStaffNotes,
      proposed: input.proposedStaffNotes,
      actorRole: input.actorRole,
      resourceType: "Appointment",
      resourceId: input.appointmentId,
      allowOverwrite: true
    });
    provenance.push(d.provenance);
    if (d.action === "conflict") failConflict(d);
    if (d.action === "accept") out.staffNotes = d.nextValue;
  }

  return { ...out, provenance };
}

export function mergeProfileDemographics(input: {
  profileId: string;
  actorRole?: string;
  existing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    healthcareNumber: string;
    address: string | null;
    dateOfBirth: Date | null;
  };
  proposed: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    healthcareNumber?: string;
    address?: string | null;
    dateOfBirth?: string | null;
  };
  allowOverwriteDemographics?: boolean;
}): {
  data: Record<string, string | Date | null | undefined>;
  mirror: ReturnType<typeof demographicsMirrorPatch> | null;
  provenance: DataProvenance[];
} {
  const provenance: DataProvenance[] = [];
  const data: Record<string, string | Date | null | undefined> = {};
  const allow = Boolean(input.allowOverwriteDemographics);

  const apply = (
    fieldKey:
      | "demographics.firstName"
      | "demographics.lastName"
      | "demographics.email"
      | "demographics.phone"
      | "demographics.healthcareNumber"
      | "demographics.address"
      | "demographics.dateOfBirth",
    existing: string | null | undefined,
    proposed: string | null | undefined,
    writeKey: string,
    transform?: (v: string) => string | Date | null
  ): void => {
    if (proposed === undefined) return;
    const d = mergeCanonicalField({
      fieldKey,
      existing,
      proposed,
      actorRole: input.actorRole,
      resourceType: "PatientProfile",
      resourceId: input.profileId,
      allowOverwrite: allow
    });
    provenance.push(d.provenance);
    if (d.action === "conflict") {
      throw new AppError(d.reason, 409, {
        code: "PROVENANCE_CONFLICT",
        field: d.provenance.field,
        existing: d.existing,
        proposed: d.proposed
      });
    }
    if (d.action === "accept") {
      data[writeKey] = transform ? transform(d.nextValue) : d.nextValue;
    }
  };

  apply("demographics.firstName", input.existing.firstName, input.proposed.firstName, "firstName");
  apply("demographics.lastName", input.existing.lastName, input.proposed.lastName, "lastName");
  apply("demographics.email", input.existing.email, input.proposed.email, "email");
  apply("demographics.phone", input.existing.phone, input.proposed.phone, "phone");
  apply(
    "demographics.healthcareNumber",
    input.existing.healthcareNumber,
    input.proposed.healthcareNumber,
    "healthcareNumber"
  );
  apply("demographics.address", input.existing.address, input.proposed.address ?? undefined, "address");
  if (input.proposed.dateOfBirth !== undefined) {
    apply(
      "demographics.dateOfBirth",
      input.existing.dateOfBirth?.toISOString() ?? null,
      input.proposed.dateOfBirth,
      "dateOfBirth",
      (v) => (v ? new Date(v) : null)
    );
  }

  const mirrorKeys = ["firstName", "lastName", "email", "phone"] as const;
  const touchedMirror = mirrorKeys.some((k) => data[k] !== undefined);
  const mirror = touchedMirror
    ? demographicsMirrorPatch({
        firstName: (data.firstName as string | undefined) ?? input.existing.firstName,
        lastName: (data.lastName as string | undefined) ?? input.existing.lastName,
        email: (data.email as string | undefined) ?? input.existing.email,
        phone: (data.phone as string | undefined) ?? input.existing.phone
      })
    : null;

  return { data, mirror, provenance };
}
