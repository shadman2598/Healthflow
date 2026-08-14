import { Router } from "express";
import { nextActionDecisionSchema } from "@technovate/shared";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { enrichAuth } from "../middleware/enrich-auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  loadNextActionsForAuth,
  restoreNextActionOverride,
  setNextActionOverride
} from "../lib/next-action-engine";

export const nextActionsRouter = Router();

nextActionsRouter.use(
  requireAuth,
  enrichAuth,
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "next-actions" })
);

nextActionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actions = await loadNextActionsForAuth(req.auth!);
    res.json({
      engine: "NEXT_ACTION",
      actions,
      computedAt: new Date().toISOString()
    });
  })
);

nextActionsRouter.post(
  "/dismiss",
  asyncHandler(async (req, res) => {
    const body = nextActionDecisionSchema.parse(req.body);
    const override = await setNextActionOverride({
      auth: req.auth!,
      auditKey: body.auditKey,
      status: "DISMISSED",
      reason: body.reason,
      snapshot: body.snapshot as never,
      ipAddress: req.ip
    });
    res.json({ override });
  })
);

nextActionsRouter.post(
  "/complete",
  asyncHandler(async (req, res) => {
    const body = nextActionDecisionSchema.parse(req.body);
    const override = await setNextActionOverride({
      auth: req.auth!,
      auditKey: body.auditKey,
      status: "COMPLETED",
      reason: body.reason,
      snapshot: body.snapshot as never,
      ipAddress: req.ip
    });
    res.json({ override });
  })
);

nextActionsRouter.post(
  "/restore",
  asyncHandler(async (req, res) => {
    const body = nextActionDecisionSchema.parse(req.body);
    const override = await restoreNextActionOverride({
      auth: req.auth!,
      auditKey: body.auditKey,
      ipAddress: req.ip
    });
    res.json({ override });
  })
);
