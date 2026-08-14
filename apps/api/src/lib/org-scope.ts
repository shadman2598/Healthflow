import type { AuthContext } from "./permissions";
import { AppError } from "../errors/app-error";

/**
 * Ensure a resource's organization matches the caller's active clinic.
 * Prevents cross-clinic IDOR when a record is loaded by id alone.
 */
export function assertSameOrganization(
  auth: AuthContext,
  resourceOrganizationId: string | null | undefined
): void {
  if (!resourceOrganizationId || resourceOrganizationId !== auth.activeOrganizationId) {
    throw new AppError("Forbidden", 403);
  }
}

/**
 * Home-org check for non-admin users (active org must equal membership org).
 * Admins/super-admins may switch via active-org cookie after validated select.
 */
export function assertActiveOrgAllowed(auth: AuthContext): void {
  if (auth.role === "ADMIN" || auth.role === "SUPER_ADMIN") return;
  if (auth.activeOrganizationId !== auth.organizationId) {
    throw new AppError("Forbidden", 403);
  }
}
