import type { NextFunction, Request, Response } from "express";
import type { Permission } from "@technovate/shared";
import { hasAllPermissions, hasAnyPermission } from "@technovate/shared";
import { AppError } from "../errors/app-error";

/** Require every listed permission (AND). */
export function requirePermissions(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError("Unauthorized", 401));
      return;
    }
    if (!hasAllPermissions(req.auth.role, permissions)) {
      next(new AppError("Forbidden", 403));
      return;
    }
    next();
  };
}

/** Require at least one listed permission (OR). */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError("Unauthorized", 401));
      return;
    }
    if (!hasAnyPermission(req.auth.role, permissions)) {
      next(new AppError("Forbidden", 403));
      return;
    }
    next();
  };
}
