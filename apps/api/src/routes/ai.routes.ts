import { Router } from "express";
import {
  aiCapabilityCatalog,
  createAiArtifactSchema,
  idParamSchema,
  reviewAiArtifactSchema
} from "@technovate/shared";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { requireAnyPermission, requirePermissions } from "../middleware/require-permission";
import { rateLimit } from "../middleware/rate-limit";
import { prisma } from "../lib/prisma";
import {
  createAiArtifactDraft,
  reviewAiArtifactRecord,
  serializeAiArtifact
} from "../lib/ai-safety";

export const aiRouter = Router();

aiRouter.use(
  requireAuth,
  enrichAuth,
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "ai" })
);

aiRouter.get(
  "/capabilities",
  requireAnyPermission("ai:use_admin", "ai:use_clinical_assist", "ai:review"),
  asyncHandler(async (_req, res) => {
    res.json(aiCapabilityCatalog());
  })
);

aiRouter.get(
  "/artifacts",
  requireAnyPermission("ai:use_admin", "ai:use_clinical_assist", "ai:review"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.aiArtifact.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json({ artifacts: rows.map(serializeAiArtifact) });
  })
);

aiRouter.get(
  "/artifacts/:id",
  requireAnyPermission("ai:use_admin", "ai:use_clinical_assist", "ai:review"),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const row = await prisma.aiArtifact.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!row) throw new AppError("AI artifact not found", 404);
    res.json({ artifact: serializeAiArtifact(row) });
  })
);

aiRouter.post(
  "/artifacts",
  requireAnyPermission("ai:use_admin", "ai:use_clinical_assist"),
  asyncHandler(async (req, res) => {
    const body = createAiArtifactSchema.parse(req.body);
    const artifact = await createAiArtifactDraft({
      auth: req.auth!,
      capabilityId: body.capabilityId,
      title: body.title,
      inputText: body.inputText,
      subject: body.subject,
      visitWhen: body.visitWhen,
      notes: body.notes,
      sources: body.sources,
      ipAddress: req.ip
    });
    res.status(201).json({ artifact });
  })
);

aiRouter.post(
  "/artifacts/:id/review",
  requirePermissions("ai:review"),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = reviewAiArtifactSchema.parse(req.body);
    const artifact = await reviewAiArtifactRecord({
      auth: req.auth!,
      artifactId: id,
      decision: body.decision,
      notes: body.notes,
      ipAddress: req.ip
    });
    res.json({ artifact });
  })
);
