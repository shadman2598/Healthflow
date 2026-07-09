import "express";
import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        role: UserRole;
        organizationId: string;
        activeOrganizationId: string;
        patientProfileId?: string;
        doctorProfileId?: string;
      };
    }
  }
}

export {};
