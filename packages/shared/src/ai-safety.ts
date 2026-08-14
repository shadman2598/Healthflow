/**
 * AI clinical-safety architecture (Prompt 40).
 *
 * AI must NOT silently make clinical decisions.
 * Categories are explicit: LOW_RISK_ADMINISTRATIVE | CLINICAL_ASSISTANCE | HIGH_RISK_CLINICAL.
 * No model provider calls live here — policy, redaction, and artifact contracts only.
 */

export type AiRiskTier = "LOW_RISK_ADMINISTRATIVE" | "CLINICAL_ASSISTANCE" | "HIGH_RISK_CLINICAL";

export type AiArtifactStatus =
  | "draft"
  | "pending_review"
  | "reviewed"
  | "rejected"
  | "blocked"
  | "failed";

export type AiSourceAttribution = {
  /** Stable resource pointer, e.g. appointment:abc, messageThread:xyz */
  ref: string;
  label?: string;
  /** Optional excerpt already PHI-minimized */
  excerpt?: string;
};

export type AiCapability = {
  id: string;
  label: string;
  description: string;
  tier: AiRiskTier;
  requiresHumanReview: boolean;
  /** When false, capability is refused before any model/stub runs. */
  allowed: boolean;
};

/** Prompt pack version — bump when safety copy or capability contracts change. */
export const AI_PROMPT_VERSION = "hf-ai-safety-v1";

/** Placeholder model id until a real provider is configured. */
export const AI_DEFAULT_MODEL_ID = "healthflow-stub-v0";

export const AI_RISK_TIER_COPY: Record<
  AiRiskTier,
  { title: string; summary: string; mayAutoApply: boolean }
> = {
  LOW_RISK_ADMINISTRATIVE: {
    title: "Low-risk administrative",
    summary: "Summarization, routing, extraction, classification, scheduling hints, and drafting.",
    mayAutoApply: false
  },
  CLINICAL_ASSISTANCE: {
    title: "Clinical assistance",
    summary: "Visit/history summaries, draft documentation, and information retrieval — never verified fact.",
    mayAutoApply: false
  },
  HIGH_RISK_CLINICAL: {
    title: "High-risk clinical",
    summary: "Diagnosis, treatment, medication decisions, and triage — blocked; humans decide.",
    mayAutoApply: false
  }
};

export const AI_CAPABILITIES: AiCapability[] = [
  // —— LOW-RISK ADMINISTRATIVE ——
  {
    id: "summarize_thread",
    label: "Summarize message thread",
    description: "Administrative summarization of inbox threads.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "route_message",
    label: "Suggest message routing",
    description: "Suggest which staff queue should own a thread.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "extract_form_fields",
    label: "Extract form fields",
    description: "Pull structured fields from free text for intake/admin forms.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "classify_ticket",
    label: "Classify request",
    description: "Classify admin/clinical request type for routing.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "suggest_schedule_slots",
    label: "Suggest schedule slots",
    description: "Propose candidate booking slots from availability rules.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "draft_patient_reply",
    label: "Draft patient reply",
    description: "Draft non-clinical administrative reply text.",
    tier: "LOW_RISK_ADMINISTRATIVE",
    requiresHumanReview: true,
    allowed: true
  },

  // —— CLINICAL ASSISTANCE ——
  {
    id: "visit_brief",
    label: "Draft visit brief",
    description: "Draft visit summary for clinician review.",
    tier: "CLINICAL_ASSISTANCE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "history_summary",
    label: "Patient history summary",
    description: "Summarize HealthFlow-held visit/history context for review.",
    tier: "CLINICAL_ASSISTANCE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "draft_note",
    label: "Draft documentation",
    description: "Draft encounter documentation for clinician edit/sign-off.",
    tier: "CLINICAL_ASSISTANCE",
    requiresHumanReview: true,
    allowed: true
  },
  {
    id: "retrieve_visit_context",
    label: "Information retrieval",
    description: "Retrieve and organize visit-related facts already in HealthFlow.",
    tier: "CLINICAL_ASSISTANCE",
    requiresHumanReview: true,
    allowed: true
  },

  // —— HIGH-RISK CLINICAL (blocked) ——
  {
    id: "diagnose",
    label: "Suggest diagnosis",
    description: "Diagnosis proposals are high-risk and blocked.",
    tier: "HIGH_RISK_CLINICAL",
    requiresHumanReview: true,
    allowed: false
  },
  {
    id: "treatment_recommend",
    label: "Treatment recommendations",
    description: "Treatment plans are high-risk and blocked.",
    tier: "HIGH_RISK_CLINICAL",
    requiresHumanReview: true,
    allowed: false
  },
  {
    id: "prescribe",
    label: "Medication decisions",
    description: "Medication selection/dosing is high-risk and blocked.",
    tier: "HIGH_RISK_CLINICAL",
    requiresHumanReview: true,
    allowed: false
  },
  {
    id: "emergency_triage",
    label: "Triage decision",
    description: "Emergency/clinical triage decisions are high-risk and blocked.",
    tier: "HIGH_RISK_CLINICAL",
    requiresHumanReview: true,
    allowed: false
  }
];

export type AiArtifactMeta = {
  capabilityId: string;
  tier: AiRiskTier;
  modelId: string;
  promptVersion: string;
  artifactVersion: number;
  sources: AiSourceAttribution[];
  /** 0–1 when the stub/model can express confidence; omit if unknown. */
  confidence?: number;
  uncertaintyNote?: string;
  humanReviewRequired: boolean;
  humanReviewedBy?: string;
  humanReviewedAt?: string;
  reviewNotes?: string;
  status: AiArtifactStatus;
  /** True when payload was PHI-minimized before generation. */
  phiRedacted: boolean;
  failureCode?: string;
  failureMessage?: string;
  /** Display disclaimer — never present as verified clinical fact. */
  disclaimer: string;
};

export type AiPresentation = {
  verifiedFact: false;
  requiresHumanReview: boolean;
  status: AiArtifactStatus;
  disclaimer: string;
  content: string;
  sources: AiSourceAttribution[];
  confidence?: number;
  uncertaintyNote?: string;
  tier: AiRiskTier;
};

export const AI_UNVERIFIED_DISCLAIMER =
  "AI-generated draft — not verified clinical fact. A qualified clinician must review before acting.";

export function classifyAiCapability(capabilityId: string): AiCapability | null {
  return AI_CAPABILITIES.find((c) => c.id === capabilityId) ?? null;
}

export function capabilitiesByTier(tier: AiRiskTier): AiCapability[] {
  return AI_CAPABILITIES.filter((c) => c.tier === tier);
}

export function assertAiAllowed(capabilityId: string): AiCapability {
  const cap = classifyAiCapability(capabilityId);
  if (!cap) throw new Error(`Unknown AI capability: ${capabilityId}`);
  if (!cap.allowed || cap.tier === "HIGH_RISK_CLINICAL") {
    throw new Error(`AI capability blocked by safety policy: ${capabilityId}`);
  }
  return cap;
}

/** Permission needed for a capability tier (RBAC mapping). */
export function permissionForAiTier(tier: AiRiskTier): "ai:use_admin" | "ai:use_clinical_assist" | null {
  if (tier === "LOW_RISK_ADMINISTRATIVE") return "ai:use_admin";
  if (tier === "CLINICAL_ASSISTANCE") return "ai:use_clinical_assist";
  return null;
}

export function buildAiArtifactShell(
  capabilityId: string,
  sources: Array<string | AiSourceAttribution>,
  extras?: Partial<AiArtifactMeta>
): AiArtifactMeta {
  const cap = assertAiAllowed(capabilityId);
  const normalizedSources: AiSourceAttribution[] = sources.map((s) =>
    typeof s === "string" ? { ref: s } : s
  );
  const base: AiArtifactMeta = {
    capabilityId: cap.id,
    tier: cap.tier,
    modelId: AI_DEFAULT_MODEL_ID,
    promptVersion: AI_PROMPT_VERSION,
    artifactVersion: 1,
    sources: normalizedSources,
    humanReviewRequired: true,
    status: "draft",
    phiRedacted: true,
    disclaimer: AI_UNVERIFIED_DISCLAIMER
  };
  return { ...base, ...omitUndefined(extras), disclaimer: extras?.disclaimer ?? AI_UNVERIFIED_DISCLAIMER };
}

function omitUndefined<T extends Record<string, unknown>>(extras?: Partial<T>): Partial<T> {
  if (!extras) return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * PHI-safe processing: minimize identifiers before any model/stub input.
 * Does not claim cryptographic de-identification — clinic SoR still holds PHI separately.
 */
export function redactPhiForAiProcessing(input: string): {
  redacted: string;
  redactedFields: string[];
} {
  const redactedFields: string[] = [];
  let redacted = input;

  const hcn = /\b\d{4}[-\s]?\d{3}[-\s]?\d{3}\b/g;
  if (hcn.test(redacted)) {
    redactedFields.push("healthcareNumber");
    redacted = redacted.replace(hcn, "[HCN_REDACTED]");
  }

  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  if (email.test(redacted)) {
    redactedFields.push("email");
    redacted = redacted.replace(email, "[EMAIL_REDACTED]");
  }

  const phone = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
  if (phone.test(redacted)) {
    redactedFields.push("phone");
    redacted = redacted.replace(phone, "[PHONE_REDACTED]");
  }

  const dob = /\b(?:19|20)\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])\b/g;
  if (dob.test(redacted)) {
    redactedFields.push("dateOfBirth");
    redacted = redacted.replace(dob, "[DOB_REDACTED]");
  }

  return { redacted, redactedFields };
}

/** Never present AI clinical/admin drafts as verified fact without review. */
export function presentAiOutput(meta: AiArtifactMeta, content: string): AiPresentation {
  const verifiedEligible = meta.status === "reviewed" && Boolean(meta.humanReviewedBy);
  return {
    verifiedFact: false,
    requiresHumanReview: meta.humanReviewRequired && !verifiedEligible,
    status: meta.status,
    disclaimer: meta.disclaimer || AI_UNVERIFIED_DISCLAIMER,
    content,
    sources: meta.sources,
    confidence: meta.confidence,
    uncertaintyNote:
      meta.uncertaintyNote ??
      (meta.confidence != null && meta.confidence < 0.6
        ? "Low model confidence — treat as incomplete draft only."
        : undefined),
    tier: meta.tier
  };
}

export function applyHumanReview(
  meta: AiArtifactMeta,
  decision: "reviewed" | "rejected",
  reviewerUserId: string,
  notes?: string,
  now = new Date()
): AiArtifactMeta {
  if (meta.status === "blocked" || meta.status === "failed") {
    throw new Error(`Cannot review artifact in status ${meta.status}`);
  }
  if (meta.tier === "HIGH_RISK_CLINICAL") {
    throw new Error("High-risk clinical artifacts cannot be approved through AI review");
  }
  return {
    ...meta,
    status: decision,
    humanReviewedBy: reviewerUserId,
    humanReviewedAt: now.toISOString(),
    reviewNotes: notes,
    artifactVersion: meta.artifactVersion + 1
  };
}

export function recordAiFailure(
  capabilityId: string,
  code: string,
  message: string,
  sources: Array<string | AiSourceAttribution> = []
): AiArtifactMeta {
  const cap = classifyAiCapability(capabilityId);
  const normalizedSources: AiSourceAttribution[] = sources.map((s) =>
    typeof s === "string" ? { ref: s } : s
  );
  return {
    capabilityId,
    tier: cap?.tier ?? "LOW_RISK_ADMINISTRATIVE",
    modelId: AI_DEFAULT_MODEL_ID,
    promptVersion: AI_PROMPT_VERSION,
    artifactVersion: 1,
    sources: normalizedSources,
    humanReviewRequired: true,
    status: cap && (!cap.allowed || cap.tier === "HIGH_RISK_CLINICAL") ? "blocked" : "failed",
    phiRedacted: true,
    failureCode: code,
    failureMessage: message,
    disclaimer: AI_UNVERIFIED_DISCLAIMER
  };
}

/**
 * Deterministic stub generation — no live model. Used until a provider is wired.
 * Still goes through the same safety shell + review requirements.
 */
export function generateStubContent(
  capabilityId: string,
  context: { subject?: string; visitWhen?: string; notes?: string }
): { content: string; confidence: number; uncertaintyNote?: string } {
  const cap = assertAiAllowed(capabilityId);
  const subject = context.subject ?? "this request";
  const when = context.visitWhen ?? "the upcoming visit";
  const notes = context.notes ? ` Context: ${context.notes}` : "";

  switch (cap.id) {
    case "summarize_thread":
      return {
        content: `Draft summary of ${subject}: patient outreach pending staff response.${notes}`,
        confidence: 0.55,
        uncertaintyNote: "Summary is heuristic — confirm against full thread."
      };
    case "route_message":
      return {
        content: `Suggested route for ${subject}: clinician inbox if clinical; front desk if scheduling/admin.`,
        confidence: 0.5
      };
    case "extract_form_fields":
      return {
        content: `Extracted fields (draft): reason=${subject}; timing=${when}.${notes}`,
        confidence: 0.45
      };
    case "classify_ticket":
      return {
        content: `Classification draft: administrative_request for ${subject}.`,
        confidence: 0.5
      };
    case "suggest_schedule_slots":
      return {
        content: `Scheduling hint: offer next open slots around ${when}; confirm provider availability in Scheduling engine.`,
        confidence: 0.4
      };
    case "draft_patient_reply":
      return {
        content: `Thank you for contacting the clinic about ${subject}. A team member will follow up shortly.`,
        confidence: 0.6
      };
    case "visit_brief":
      return {
        content: `Visit brief draft for ${when}: reason — ${subject}.${notes}\n\nDo not treat as charted clinical fact.`,
        confidence: 0.45,
        uncertaintyNote: "Clinical assistance only — clinician must verify."
      };
    case "history_summary":
      return {
        content: `History summary draft from HealthFlow records for ${subject}.${notes}\n\nExternal EHR/LIS content is out of scope unless sourced.`,
        confidence: 0.4
      };
    case "draft_note":
      return {
        content: `Encounter note draft (${when}): Chief concern — ${subject}.${notes}\n\nRequires clinician edit and attestation.`,
        confidence: 0.4
      };
    case "retrieve_visit_context":
      return {
        content: `Retrieved HealthFlow context for ${subject} / ${when}.${notes}`,
        confidence: 0.65
      };
    default:
      return { content: `Draft for ${cap.label}.`, confidence: 0.3 };
  }
}

/** Catalog payload for UI / API discovery. */
export function aiCapabilityCatalog(): {
  tiers: typeof AI_RISK_TIER_COPY;
  capabilities: AiCapability[];
  promptVersion: string;
  modelId: string;
  disclaimer: string;
} {
  return {
    tiers: AI_RISK_TIER_COPY,
    capabilities: AI_CAPABILITIES,
    promptVersion: AI_PROMPT_VERSION,
    modelId: AI_DEFAULT_MODEL_ID,
    disclaimer: AI_UNVERIFIED_DISCLAIMER
  };
}
