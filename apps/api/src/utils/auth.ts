import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env";

import type { UserRole } from "@prisma/client";

type AuthTokenPayload = {
  userId: string;
  role: UserRole;
  email: string;
  organizationId: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string & jwt.SignOptions["expiresIn"]
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME);
  res.clearCookie(env.ACTIVE_ORG_COOKIE_NAME);
}

export function setActiveOrganizationCookie(res: Response, organizationId: string): void {
  res.cookie(env.ACTIVE_ORG_COOKIE_NAME, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
