import { Router } from "express";
import { idParamSchema, updateReminderRuleSchema } from "@technovate/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { requirePermissions } from "../middleware/require-permission";

export const reminderRulesRouter = Router();

reminderRulesRouter.use(requireAuth, requirePermissions("reminder:manage_rules"));

reminderRulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rules = await prisma.reminderRule.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      orderBy: [{ offsetMinutes: "desc" }, { createdAt: "asc" }]
    });

    res.json({ rules });
  })
);

reminderRulesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateReminderRuleSchema.parse(req.body);

    const existing = await prisma.reminderRule.findFirst({
      where: { id, organizationId: req.auth!.activeOrganizationId }
    });
    if (!existing) throw new AppError("Reminder rule not found", 404);

    const rule = await prisma.reminderRule.update({
      where: { id },
      data: { enabled: body.enabled }
    });

    res.json({ rule });
  })
);
