import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { requirePermissions } from "../middleware/require-permission";

export const auditRouter = Router();

auditRouter.use(requireAuth, requirePermissions("audit:read"));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      include: { actor: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json({ logs });
  })
);
