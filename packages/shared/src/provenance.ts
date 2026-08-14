/**
 * Data provenance helpers (Prompt 36 — never enter twice).
 */

export type DataProvenanceSource =
  | "patient_provided"
  | "clinician_entered"
  | "receptionist_entered"
  | "system_generated"
  | "imported"
  | "ai_generated";

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

/** Fields that should flow forward from appointment → prep → message drafts. */
export function appointmentContextSnippet(input: {
  reason?: string | null;
  category?: string;
  scheduledAt?: string;
  patientNotes?: string | null;
}): string {
  const lines = [
    input.scheduledAt ? `Visit: ${new Date(input.scheduledAt).toLocaleString()}` : null,
    input.reason ? `Reason: ${input.reason}` : input.category ? `Type: ${input.category}` : null,
    input.patientNotes ? `Patient notes: ${input.patientNotes}` : null
  ].filter(Boolean);
  return lines.join("\n");
}
