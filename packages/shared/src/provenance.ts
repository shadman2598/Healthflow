/**
 * “Never enter data twice” engine (Prompt 36).
 *
 * Canonical SoR + safe merge + propagation + provenance.
 * Clinically important fields are never silently overwritten.
 */

export type DataProvenanceSource =
  | "patient_provided"
  | "clinician_entered"
  | "receptionist_entered"
  | "system_generated"
  | "imported"
  | "ai_generated"
  | "external_ehr";

export type DataProvenance = {
  field: string;
  valueSummary: string;
  source: DataProvenanceSource;
  actorRole?: string;
  collectedAt: string;
  resourceType: string;
  resourceId: string;
};

export function provenance(
  input: Omit<DataProvenance, "collectedAt"> & { collectedAt?: string }
): DataProvenance {
  return {
    ...input,
    collectedAt: input.collectedAt ?? new Date().toISOString()
  };
}

/** Where users historically re-typed the same facts (audit map). */
export const DUPLICATE_ENTRY_AUDIT = [
  {
    field: "demographics",
    enteredIn: ["Patient signup", "POST /patients (legacy)", "POST /patient-profiles", "Patient mirror row"],
    canonical: "PatientProfile",
    risk: "Name/email/phone drift between Patient and PatientProfile"
  },
  {
    field: "appointment.reason",
    enteredIn: ["Desk booking", "Patient message request", "Care Guide → Messages draft"],
    canonical: "Appointment.reason",
    risk: "Reason re-asked at check-in / cockpit"
  },
  {
    field: "appointment.patientNotes",
    enteredIn: ["Patient appointment update", "Care Guide questions", "Messages"],
    canonical: "Appointment.patientNotes",
    risk: "Staff overwrite of patient-provided text"
  },
  {
    field: "medications",
    enteredIn: ["Care Guide checklist (local)", "Verbal at desk", "EHR"],
    canonical: "external_ehr",
    risk: "Inventing a second med list in HealthFlow"
  },
  {
    field: "allergies",
    enteredIn: ["Verbal", "EHR"],
    canonical: "external_ehr",
    risk: "Safety-critical duplication"
  },
  {
    field: "insurance",
    enteredIn: ["FAQ/fees copy", "Messages", "Provincial coverage (external)"],
    canonical: "external_payer",
    risk: "No HealthFlow insurance SoR — keep in Messages / EHR"
  },
  {
    field: "forms_symptoms",
    enteredIn: ["Care Guide pathways", "Visit prep localStorage", "Messages"],
    canonical: "propagate_to_message_or_patientNotes",
    risk: "Symptoms re-typed into chart"
  },
  {
    field: "referrals_results",
    enteredIn: ["Messages subject lines", "EHR / LIS"],
    canonical: "external_ehr",
    risk: "Fake referral tracker"
  }
] as const;

export type CanonicalOwner =
  | "PatientProfile"
  | "Appointment"
  | "MessageThread"
  | "external_ehr"
  | "external_payer"
  | "ephemeral_client";

export type MergePolicy =
  /** Write only when the canonical field is empty. */
  | "fill_if_empty"
  /** Allow replace only with explicit allowOverwrite (audited). */
  | "require_explicit_overwrite"
  /** Never store in HealthFlow — surface external pointer only. */
  | "external_only"
  /** Mirror from PatientProfile → Patient contact fields. */
  | "mirror_from_profile";

export type CanonicalFieldKey =
  | "demographics.firstName"
  | "demographics.lastName"
  | "demographics.email"
  | "demographics.phone"
  | "demographics.dateOfBirth"
  | "demographics.healthcareNumber"
  | "demographics.address"
  | "appointment.reason"
  | "appointment.patientNotes"
  | "appointment.staffNotes"
  | "clinical.medications"
  | "clinical.allergies"
  | "clinical.results"
  | "clinical.referrals"
  | "coverage.insurance"
  | "forms.symptoms";

export type CanonicalFieldDef = {
  key: CanonicalFieldKey;
  owner: CanonicalOwner;
  policy: MergePolicy;
  clinicallyImportant: boolean;
  label: string;
};

export const CANONICAL_FIELDS: Record<CanonicalFieldKey, CanonicalFieldDef> = {
  "demographics.firstName": {
    key: "demographics.firstName",
    owner: "PatientProfile",
    policy: "require_explicit_overwrite",
    clinicallyImportant: true,
    label: "First name"
  },
  "demographics.lastName": {
    key: "demographics.lastName",
    owner: "PatientProfile",
    policy: "require_explicit_overwrite",
    clinicallyImportant: true,
    label: "Last name"
  },
  "demographics.email": {
    key: "demographics.email",
    owner: "PatientProfile",
    policy: "require_explicit_overwrite",
    clinicallyImportant: false,
    label: "Email"
  },
  "demographics.phone": {
    key: "demographics.phone",
    owner: "PatientProfile",
    policy: "fill_if_empty",
    clinicallyImportant: false,
    label: "Phone"
  },
  "demographics.dateOfBirth": {
    key: "demographics.dateOfBirth",
    owner: "PatientProfile",
    policy: "fill_if_empty",
    clinicallyImportant: true,
    label: "Date of birth"
  },
  "demographics.healthcareNumber": {
    key: "demographics.healthcareNumber",
    owner: "PatientProfile",
    policy: "require_explicit_overwrite",
    clinicallyImportant: true,
    label: "Healthcare number"
  },
  "demographics.address": {
    key: "demographics.address",
    owner: "PatientProfile",
    policy: "fill_if_empty",
    clinicallyImportant: false,
    label: "Address"
  },
  "appointment.reason": {
    key: "appointment.reason",
    owner: "Appointment",
    policy: "fill_if_empty",
    clinicallyImportant: true,
    label: "Visit reason"
  },
  "appointment.patientNotes": {
    key: "appointment.patientNotes",
    owner: "Appointment",
    policy: "require_explicit_overwrite",
    clinicallyImportant: true,
    label: "Patient-provided notes"
  },
  "appointment.staffNotes": {
    key: "appointment.staffNotes",
    owner: "Appointment",
    policy: "fill_if_empty",
    clinicallyImportant: false,
    label: "Staff notes"
  },
  "clinical.medications": {
    key: "clinical.medications",
    owner: "external_ehr",
    policy: "external_only",
    clinicallyImportant: true,
    label: "Medications"
  },
  "clinical.allergies": {
    key: "clinical.allergies",
    owner: "external_ehr",
    policy: "external_only",
    clinicallyImportant: true,
    label: "Allergies"
  },
  "clinical.results": {
    key: "clinical.results",
    owner: "external_ehr",
    policy: "external_only",
    clinicallyImportant: true,
    label: "Results"
  },
  "clinical.referrals": {
    key: "clinical.referrals",
    owner: "external_ehr",
    policy: "external_only",
    clinicallyImportant: true,
    label: "Referrals"
  },
  "coverage.insurance": {
    key: "coverage.insurance",
    owner: "external_payer",
    policy: "external_only",
    clinicallyImportant: true,
    label: "Insurance"
  },
  "forms.symptoms": {
    key: "forms.symptoms",
    owner: "ephemeral_client",
    policy: "fill_if_empty",
    clinicallyImportant: false,
    label: "Symptoms / prep"
  }
};

export type MergeDecision =
  | {
      action: "accept";
      nextValue: string;
      provenance: DataProvenance;
    }
  | {
      action: "keep";
      reason: string;
      nextValue: string;
      provenance: DataProvenance;
    }
  | {
      action: "conflict";
      reason: string;
      existing: string;
      proposed: string;
      provenance: DataProvenance;
    }
  | {
      action: "reject_external";
      reason: string;
      provenance: DataProvenance;
    };

function summarize(value: string, max = 160): string {
  const t = value.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function isEmpty(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function sourceForRole(role?: string): DataProvenanceSource {
  switch (role) {
    case "PATIENT":
      return "patient_provided";
    case "DOCTOR":
    case "NURSE":
      return "clinician_entered";
    case "RECEPTIONIST":
    case "BILLING":
    case "ADMIN":
    case "SUPER_ADMIN":
      return "receptionist_entered";
    default:
      return "system_generated";
  }
}

/**
 * Safe merge for a canonical field. Never silently overwrites clinically important data.
 */
export function mergeCanonicalField(input: {
  fieldKey: CanonicalFieldKey;
  existing: string | null | undefined;
  proposed: string | null | undefined;
  actorRole?: string;
  source?: DataProvenanceSource;
  resourceType: string;
  resourceId: string;
  /** Required to replace a non-empty protected value. */
  allowOverwrite?: boolean;
  collectedAt?: string;
}): MergeDecision {
  const def = CANONICAL_FIELDS[input.fieldKey];
  const source = input.source ?? sourceForRole(input.actorRole);
  const baseProv = provenance({
    field: def.key,
    valueSummary: summarize(String(input.proposed ?? input.existing ?? "")),
    source,
    actorRole: input.actorRole,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    collectedAt: input.collectedAt
  });

  if (def.policy === "external_only") {
    return {
      action: "reject_external",
      reason: `${def.label} is owned by ${def.owner} — do not store a second copy in HealthFlow`,
      provenance: { ...baseProv, source: "external_ehr", valueSummary: def.label }
    };
  }

  if (input.proposed === undefined) {
    return {
      action: "keep",
      reason: "No proposed value",
      nextValue: String(input.existing ?? ""),
      provenance: {
        ...baseProv,
        valueSummary: summarize(String(input.existing ?? ""))
      }
    };
  }

  if (input.proposed === null || isEmpty(input.proposed)) {
    if (!isEmpty(input.existing) && def.clinicallyImportant && !input.allowOverwrite) {
      return {
        action: "conflict",
        reason: `Refusing to clear clinically important field ${def.label} without allowOverwrite`,
        existing: String(input.existing),
        proposed: "",
        provenance: baseProv
      };
    }
  }

  const proposed = input.proposed == null ? "" : String(input.proposed);
  const existing = input.existing == null ? "" : String(input.existing);

  if (!isEmpty(existing) && proposed.trim() === existing.trim()) {
    return {
      action: "keep",
      reason: "Unchanged",
      nextValue: existing,
      provenance: { ...baseProv, valueSummary: summarize(existing) }
    };
  }

  if (def.policy === "fill_if_empty") {
    if (!isEmpty(existing) && proposed.trim() !== existing.trim()) {
      if (input.allowOverwrite) {
        return {
          action: "accept",
          nextValue: proposed,
          provenance: {
            ...baseProv,
            valueSummary: summarize(proposed)
          }
        };
      }
      return {
        action: "conflict",
        reason: `${def.label} already set — will not silently overwrite`,
        existing,
        proposed,
        provenance: baseProv
      };
    }
    return {
      action: "accept",
      nextValue: proposed,
      provenance: { ...baseProv, valueSummary: summarize(proposed) }
    };
  }

  // require_explicit_overwrite
  if (!isEmpty(existing) && proposed.trim() !== existing.trim() && !input.allowOverwrite) {
    return {
      action: "conflict",
      reason: `${def.label} is protected — pass allowOverwrite to replace (audited)`,
      existing,
      proposed,
      provenance: baseProv
    };
  }

  return {
    action: "accept",
    nextValue: proposed,
    provenance: { ...baseProv, valueSummary: summarize(proposed) }
  };
}

/** Apply many field merges; collect accepts + conflicts (no silent drops). */
export function mergeCanonicalBatch(
  fields: Array<Parameters<typeof mergeCanonicalField>[0]>
): {
  accepted: Record<string, string>;
  provenance: DataProvenance[];
  conflicts: Array<Extract<MergeDecision, { action: "conflict" | "reject_external" }>>;
} {
  const accepted: Record<string, string> = {};
  const provenanceRows: DataProvenance[] = [];
  const conflicts: Array<Extract<MergeDecision, { action: "conflict" | "reject_external" }>> = [];

  for (const field of fields) {
    const decision = mergeCanonicalField(field);
    provenanceRows.push(decision.provenance);
    if (decision.action === "accept") {
      accepted[field.fieldKey] = decision.nextValue;
    } else if (decision.action === "conflict" || decision.action === "reject_external") {
      conflicts.push(decision);
    }
  }

  return { accepted, provenance: provenanceRows, conflicts };
}

/** Contact fields mirrored onto legacy Patient rows for the reminder engine. */
export function demographicsMirrorPatch(profile: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): { firstName: string; lastName: string; email: string; phone: string } {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone
  };
}

export type VisitPropagationInput = {
  reason?: string | null;
  category?: string;
  scheduledAt?: string;
  patientNotes?: string | null;
  staffNotes?: string | null;
  patientName?: string;
};

/** Single bundle so reason/notes flow to messages & prep without re-typing. */
export function buildVisitPropagationBundle(input: VisitPropagationInput): {
  messageDraft: string;
  contextSnippet: string;
  facts: DataProvenance[];
} {
  const contextSnippet = appointmentContextSnippet(input);
  const messageDraft = [
    input.patientName ? `Re: ${input.patientName}` : null,
    contextSnippet,
    "",
    "(Context copied from the visit — edit only what’s new.)"
  ]
    .filter(Boolean)
    .join("\n");

  const facts: DataProvenance[] = [];
  if (input.reason) {
    facts.push(
      provenance({
        field: "appointment.reason",
        valueSummary: summarize(input.reason),
        source: "receptionist_entered",
        resourceType: "Appointment",
        resourceId: "propagate"
      })
    );
  }
  if (input.patientNotes) {
    facts.push(
      provenance({
        field: "appointment.patientNotes",
        valueSummary: summarize(input.patientNotes),
        source: "patient_provided",
        resourceType: "Appointment",
        resourceId: "propagate"
      })
    );
  }
  if (input.staffNotes) {
    facts.push(
      provenance({
        field: "appointment.staffNotes",
        valueSummary: summarize(input.staffNotes),
        source: "receptionist_entered",
        resourceType: "Appointment",
        resourceId: "propagate"
      })
    );
  }

  return { messageDraft, contextSnippet, facts };
}

/** Fields that should flow forward from appointment → prep → message drafts. */
export function appointmentContextSnippet(input: {
  reason?: string | null;
  category?: string;
  scheduledAt?: string;
  patientNotes?: string | null;
  staffNotes?: string | null;
}): string {
  const lines = [
    input.scheduledAt ? `Visit: ${new Date(input.scheduledAt).toLocaleString()}` : null,
    input.reason ? `Reason: ${input.reason}` : input.category ? `Type: ${input.category}` : null,
    input.patientNotes ? `Patient notes: ${input.patientNotes}` : null,
    input.staffNotes ? `Desk notes: ${input.staffNotes}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

export function roleToProvenanceSource(role?: string): DataProvenanceSource {
  return sourceForRole(role);
}

/** Map actor role → default source label for UI. */
export function provenanceSourceLabel(source: DataProvenanceSource): string {
  switch (source) {
    case "patient_provided":
      return "Patient-provided";
    case "clinician_entered":
      return "Clinician-entered";
    case "receptionist_entered":
      return "Reception / ops entered";
    case "system_generated":
      return "System-generated";
    case "imported":
      return "Imported";
    case "ai_generated":
      return "AI-generated (review required)";
    case "external_ehr":
      return "External EHR / clinical system";
    default:
      return source;
  }
}
