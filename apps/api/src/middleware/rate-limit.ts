import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = req.ip ?? "unknown";
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      next(new AppError("Too many requests. Please try again later.", 429));
      return;
    }

    bucket.count += 1;
    next();
  };
}
