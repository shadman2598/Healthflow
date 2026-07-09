import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "../errors/app-error";

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError("Unauthorized", 401));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError("Forbidden", 403));
      return;
    }
    next();
  };
}

// Backward compatible alias
export function requireRole(role: UserRole) {
  return requireRoles(role);
}
