import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { verifyAuthToken } from "../utils/auth";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;

  if (!token) {
    next(new AppError("Unauthorized", 401));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, isActive: true, organizationId: true, role: true, email: true }
    });

    // Revoked / deleted accounts cannot keep using a valid JWT.
    if (!user || !user.isActive) {
      next(new AppError("Unauthorized", 401));
      return;
    }

    // Prefer live DB role/org over stale JWT claims after privilege changes.
    const role = user.role;
    const organizationId = user.organizationId;
    const requestedOrgId = req.cookies?.[env.ACTIVE_ORG_COOKIE_NAME] as string | undefined;

    let activeOrganizationId = organizationId;
    if ((role === "ADMIN" || role === "SUPER_ADMIN") && requestedOrgId) {
      const org = await prisma.organization.findUnique({
        where: { id: requestedOrgId },
        select: { id: true }
      });
      if (!org) {
        next(new AppError("Forbidden", 403));
        return;
      }
      activeOrganizationId = org.id;
    } else if (requestedOrgId && requestedOrgId !== organizationId) {
      // Non-admins cannot pivot into another clinic via cookie tampering.
      next(new AppError("Forbidden", 403));
      return;
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      role,
      organizationId,
      activeOrganizationId
    };
    next();
  } catch {
    next(new AppError("Unauthorized", 401));
  }
}
