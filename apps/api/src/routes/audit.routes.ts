import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { requireAuth } from "../middleware/require-auth";
import { requireRoles } from "../middleware/require-role";
import { canViewAuditLogs } from "../lib/permissions";
import { AppError } from "../errors/app-error";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!canViewAuditLogs(req.auth!)) throw new AppError("Forbidden", 403);

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: req.auth!.activeOrganizationId },
      include: { actor: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json({ logs });
  })
);
