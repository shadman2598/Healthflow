import { createHash } from "crypto";
import {
  AI_DEFAULT_MODEL_ID,
  AI_PROMPT_VERSION,
  AI_UNVERIFIED_DISCLAIMER,
  applyHumanReview,
  assertAiAllowed,
  buildAiArtifactShell,
  generateStubContent,
  permissionForAiTier,
  presentAiOutput,
  recordAiFailure,
  redactPhiForAiProcessing,
  type AiSourceAttribution
} from "@technovate/shared";
import type { AiArtifact, AiArtifactStatus, AiRiskTier } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { prisma } from "./prisma";
import { auditBlockedPrescription, writeAuditLog } from "./audit";
import type { AuthContext } from "./permissions";
import { authHasPermission } from "./permissions";

const STATUS_TO_DB: Record<string, AiArtifactStatus> = {
  draft: "DRAFT",
  pending_review: "PENDING_REVIEW",
  reviewed: "REVIEWED",
  rejected: "REJECTED",
  blocked: "BLOCKED",
  failed: "FAILED"
};

const STATUS_FROM_DB: Record<AiArtifactStatus, string> = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  REVIEWED: "reviewed",
  REJECTED: "rejected",
  BLOCKED: "blocked",
  FAILED: "failed"
};

const TIER_TO_DB: Record<string, AiRiskTier> = {
  LOW_RISK_ADMINISTRATIVE: "LOW_RISK_ADMINISTRATIVE",
  CLINICAL_ASSISTANCE: "CLINICAL_ASSISTANCE",
  HIGH_RISK_CLINICAL: "HIGH_RISK_CLINICAL"
};

function inputHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function serializeAiArtifact(row: AiArtifact) {
  const sources = (row.sourcesJson as AiSourceAttribution[]) ?? [];
  const meta = {
    capabilityId: row.capabilityId,
    tier: row.tier as "LOW_RISK_ADMINISTRATIVE" | "CLINICAL_ASSISTANCE" | "HIGH_RISK_CLINICAL",
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    artifactVersion: row.artifactVersion,
    sources,
    confidence: row.confidence ?? undefined,
    uncertaintyNote: row.uncertaintyNote ?? undefined,
    humanReviewRequired: row.humanReviewRequired,
    humanReviewedBy: row.reviewedByUserId ?? undefined,
    humanReviewedAt: row.reviewedAt?.toISOString(),
    reviewNotes: row.reviewNotes ?? undefined,
    status: STATUS_FROM_DB[row.status] as
      | "draft"
      | "pending_review"
      | "reviewed"
      | "rejected"
      | "blocked"
      | "failed",
    phiRedacted: row.phiRedacted,
    failureCode: row.failureCode ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
    disclaimer: row.disclaimer
  };
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    inputHash: row.inputHash,
    meta,
    presentation: presentAiOutput(meta, row.content)
  };
}

export function assertCanUseAiCapability(auth: AuthContext, capabilityId: string) {
  let cap;
  try {
    cap = assertAiAllowed(capabilityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI capability blocked";
    throw new AppError(message, 403);
  }
  const perm = permissionForAiTier(cap.tier);
  if (!perm || !authHasPermission(auth, perm)) {
    throw new AppError(`Missing permission for AI tier ${cap.tier}`, 403);
  }
  return cap;
}

export async function createAiArtifactDraft(input: {
  auth: AuthContext;
  capabilityId: string;
  title?: string;
  inputText?: string;
  subject?: string;
  visitWhen?: string;
  notes?: string;
  sources?: AiSourceAttribution[];
  ipAddress?: string;
}) {
  const { auth } = input;

  try {
    assertCanUseAiCapability(auth, input.capabilityId);
  } catch (error) {
    const failure = recordAiFailure(
      input.capabilityId,
      "POLICY_BLOCKED",
      error instanceof Error ? error.message : "Blocked"
    );
    await writeAuditLog({
      organizationId: auth.activeOrganizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: "AI_BLOCKED",
      targetType: "AiCapability",
      targetId: input.capabilityId,
      source: "api:/ai/artifacts",
      ipAddress: input.ipAddress,
      metadata: { failureCode: failure.failureCode, message: failure.failureMessage }
    });
    if (
      ["diagnose", "prescribe", "treatment_recommend", "emergency_triage"].includes(input.capabilityId)
    ) {
      await auditBlockedPrescription({
        organizationId: auth.activeOrganizationId,
        actorId: auth.userId,
        actorRole: auth.role,
        capabilityId: input.capabilityId,
        ipAddress: input.ipAddress,
        source: "api:/ai/artifacts"
      });
    }
    throw error;
  }

  const raw = [input.inputText, input.subject, input.notes, input.visitWhen].filter(Boolean).join("\n");
  const { redacted, redactedFields } = redactPhiForAiProcessing(raw || input.subject || "request");

  let stub;
  try {
    stub = generateStubContent(input.capabilityId, {
      subject: input.subject,
      visitWhen: input.visitWhen,
      notes: redacted.slice(0, 500)
    });
  } catch (error) {
    const failure = recordAiFailure(
      input.capabilityId,
      "GENERATION_FAILED",
      error instanceof Error ? error.message : "Generation failed",
      input.sources ?? []
    );
    const blocked = await prisma.aiArtifact.create({
      data: {
        organizationId: auth.activeOrganizationId,
        capabilityId: input.capabilityId,
        tier: TIER_TO_DB[failure.tier],
        status: STATUS_TO_DB[failure.status],
        title: input.title ?? `Failed: ${input.capabilityId}`,
        content: "",
        sourcesJson: failure.sources,
        modelId: failure.modelId,
        promptVersion: failure.promptVersion,
        humanReviewRequired: true,
        phiRedacted: true,
        failureCode: failure.failureCode,
        failureMessage: failure.failureMessage,
        disclaimer: failure.disclaimer,
        createdByUserId: auth.userId,
        inputHash: inputHash(raw)
      }
    });
    await writeAuditLog({
      organizationId: auth.activeOrganizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: "AI_FAILED",
      targetType: "AiArtifact",
      targetId: blocked.id,
      ipAddress: input.ipAddress,
      metadata: { capabilityId: input.capabilityId, code: failure.failureCode }
    });
    return serializeAiArtifact(blocked);
  }

  const shell = buildAiArtifactShell(input.capabilityId, input.sources ?? [], {
    confidence: stub.confidence,
    uncertaintyNote: stub.uncertaintyNote,
    phiRedacted: true,
    modelId: AI_DEFAULT_MODEL_ID,
    promptVersion: AI_PROMPT_VERSION,
    status: "pending_review"
  });

  const row = await prisma.aiArtifact.create({
    data: {
      organizationId: auth.activeOrganizationId,
      capabilityId: shell.capabilityId,
      tier: TIER_TO_DB[shell.tier],
      status: "PENDING_REVIEW",
      title: input.title ?? shell.capabilityId,
      content: stub.content,
      sourcesJson: shell.sources,
      confidence: shell.confidence,
      uncertaintyNote: shell.uncertaintyNote,
      modelId: shell.modelId,
      promptVersion: shell.promptVersion,
      artifactVersion: shell.artifactVersion,
      humanReviewRequired: true,
      phiRedacted: true,
      disclaimer: AI_UNVERIFIED_DISCLAIMER,
      createdByUserId: auth.userId,
      inputHash: inputHash(raw)
    }
  });

  await writeAuditLog({
    organizationId: auth.activeOrganizationId,
    actorId: auth.userId,
    actorRole: auth.role,
    action: "AI_GENERATED",
    targetType: "AiArtifact",
    targetId: row.id,
    ipAddress: input.ipAddress,
    metadata: {
      capabilityId: shell.capabilityId,
      tier: shell.tier,
      modelId: shell.modelId,
      promptVersion: shell.promptVersion,
      phiRedactedFields: redactedFields,
      status: "pending_review"
    }
  });

  return serializeAiArtifact(row);
}

export async function reviewAiArtifactRecord(input: {
  auth: AuthContext;
  artifactId: string;
  decision: "reviewed" | "rejected";
  notes?: string;
  ipAddress?: string;
}) {
  if (!authHasPermission(input.auth, "ai:review")) {
    throw new AppError("Missing ai:review permission", 403);
  }

  const existing = await prisma.aiArtifact.findFirst({
    where: { id: input.artifactId, organizationId: input.auth.activeOrganizationId }
  });
  if (!existing) throw new AppError("AI artifact not found", 404);
  if (existing.status === "BLOCKED" || existing.status === "FAILED") {
    throw new AppError(`Cannot review artifact in status ${existing.status}`, 400);
  }
  if (existing.tier === "HIGH_RISK_CLINICAL") {
    throw new AppError("High-risk clinical artifacts cannot be approved", 403);
  }

  const meta = applyHumanReview(
    {
      capabilityId: existing.capabilityId,
      tier: existing.tier as "LOW_RISK_ADMINISTRATIVE" | "CLINICAL_ASSISTANCE" | "HIGH_RISK_CLINICAL",
      modelId: existing.modelId,
      promptVersion: existing.promptVersion,
      artifactVersion: existing.artifactVersion,
      sources: (existing.sourcesJson as AiSourceAttribution[]) ?? [],
      confidence: existing.confidence ?? undefined,
      uncertaintyNote: existing.uncertaintyNote ?? undefined,
      humanReviewRequired: existing.humanReviewRequired,
      status: STATUS_FROM_DB[existing.status] as "draft" | "pending_review" | "reviewed" | "rejected",
      phiRedacted: existing.phiRedacted,
      disclaimer: existing.disclaimer
    },
    input.decision,
    input.auth.userId,
    input.notes
  );

  const updated = await prisma.aiArtifact.update({
    where: { id: existing.id },
    data: {
      status: STATUS_TO_DB[meta.status],
      reviewedByUserId: meta.humanReviewedBy,
      reviewedAt: meta.humanReviewedAt ? new Date(meta.humanReviewedAt) : new Date(),
      reviewNotes: meta.reviewNotes,
      artifactVersion: meta.artifactVersion
    }
  });

  await writeAuditLog({
    organizationId: input.auth.activeOrganizationId,
    actorId: input.auth.userId,
    actorRole: input.auth.role,
    action: "AI_REVIEWED",
    targetType: "AiArtifact",
    targetId: updated.id,
    ipAddress: input.ipAddress,
    metadata: {
      decision: input.decision,
      capabilityId: updated.capabilityId,
      artifactVersion: updated.artifactVersion
    }
  });

  return serializeAiArtifact(updated);
}
