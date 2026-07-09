import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { verifyAuthToken } from "../utils/auth";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;

  if (!token) {
    next(new AppError("Unauthorized", 401));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const requestedOrgId = req.cookies?.[env.ACTIVE_ORG_COOKIE_NAME] as string | undefined;
    const activeOrganizationId =
      (payload.role === "ADMIN" || payload.role === "SUPER_ADMIN") && requestedOrgId
        ? requestedOrgId
        : payload.organizationId;

    req.auth = {
      ...payload,
      activeOrganizationId
    };
    next();
  } catch {
    next(new AppError("Unauthorized", 401));
  }
}
