/**
 * AI clinical-safety boundaries (Prompt 40).
 * No model calls here — policy + classification only.
 */

export type AiRiskTier = "LOW_RISK_ADMINISTRATIVE" | "CLINICAL_ASSISTANCE" | "HIGH_RISK_CLINICAL";

export type AiCapability = {
  id: string;
  label: string;
  tier: AiRiskTier;
  requiresHumanReview: boolean;
  allowed: boolean;
};

export const AI_CAPABILITIES: AiCapability[] = [
  { id: "summarize_thread", label: "Summarize message thread", tier: "LOW_RISK_ADMINISTRATIVE", requiresHumanReview: false, allowed: true },
  { id: "route_message", label: "Suggest message routing", tier: "LOW_RISK_ADMINISTRATIVE", requiresHumanReview: true, allowed: true },
  { id: "draft_patient_reply", label: "Draft patient reply", tier: "LOW_RISK_ADMINISTRATIVE", requiresHumanReview: true, allowed: true },
  { id: "extract_form_fields", label: "Extract form fields", tier: "LOW_RISK_ADMINISTRATIVE", requiresHumanReview: true, allowed: true },
  { id: "visit_brief", label: "Draft visit brief", tier: "CLINICAL_ASSISTANCE", requiresHumanReview: true, allowed: true },
  { id: "draft_note", label: "Draft encounter note", tier: "CLINICAL_ASSISTANCE", requiresHumanReview: true, allowed: true },
  { id: "diagnose", label: "Suggest diagnosis", tier: "HIGH_RISK_CLINICAL", requiresHumanReview: true, allowed: false },
  { id: "prescribe", label: "Suggest medication", tier: "HIGH_RISK_CLINICAL", requiresHumanReview: true, allowed: false },
  { id: "emergency_triage", label: "Emergency triage decision", tier: "HIGH_RISK_CLINICAL", requiresHumanReview: true, allowed: false }
];

export type AiArtifactMeta = {
  capabilityId: string;
  tier: AiRiskTier;
  modelId?: string;
  promptVersion?: string;
  sources: string[];
  confidence?: number;
  humanReviewRequired: boolean;
  humanReviewedBy?: string;
  status: "draft" | "reviewed" | "rejected" | "blocked";
};

export function classifyAiCapability(capabilityId: string): AiCapability | null {
  return AI_CAPABILITIES.find((c) => c.id === capabilityId) ?? null;
}

export function assertAiAllowed(capabilityId: string): AiCapability {
  const cap = classifyAiCapability(capabilityId);
  if (!cap) throw new Error(`Unknown AI capability: ${capabilityId}`);
  if (!cap.allowed || cap.tier === "HIGH_RISK_CLINICAL") {
    throw new Error(`AI capability blocked by safety policy: ${capabilityId}`);
  }
  return cap;
}

export function buildAiArtifactShell(
  capabilityId: string,
  sources: string[],
  extras?: Partial<AiArtifactMeta>
): AiArtifactMeta {
  const cap = assertAiAllowed(capabilityId);
  return {
    capabilityId: cap.id,
    tier: cap.tier,
    sources,
    humanReviewRequired: cap.requiresHumanReview,
    status: cap.requiresHumanReview ? "draft" : "reviewed",
    ...extras
  };
}
