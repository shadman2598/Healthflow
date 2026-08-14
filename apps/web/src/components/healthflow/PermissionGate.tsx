"use client";

import { roleHasAllPermissions, roleHasAnyPermission, type Permission } from "../../lib/permissions";
import type { HealthFlowRole } from "../../types/healthflow";

type PermissionGateProps = {
  role: HealthFlowRole | string;
  /** All listed permissions required (AND). */
  requireAll?: Permission[];
  /** At least one permission required (OR). Ignored if requireAll is set. */
  requireAny?: Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * UX-only permission gate. Never a security boundary — API must enforce.
 */
export function PermissionGate({
  role,
  requireAll,
  requireAny,
  children,
  fallback = null
}: PermissionGateProps) {
  const allowed = requireAll?.length
    ? roleHasAllPermissions(role, requireAll)
    : requireAny?.length
      ? roleHasAnyPermission(role, requireAny)
      : true;

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
