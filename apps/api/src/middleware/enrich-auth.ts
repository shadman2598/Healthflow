import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function enrichAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    include: { patientProfile: true, doctorProfile: true }
  });

  if (user) {
    req.auth.patientProfileId = user.patientProfile?.id;
    req.auth.doctorProfileId = user.doctorProfile?.id;
  }

  next();
}
