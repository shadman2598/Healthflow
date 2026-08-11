"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { getGuestUser } from "../../lib/guest-session";
import { normalizeRole, roleDashboardPath, roleLoginPath } from "../../lib/role-config";
import type { HealthFlowRole, HealthFlowUser } from "../../types/healthflow";
import { RoleShell } from "./RoleShell";

type ProtectedRolePageProps = {
  children: React.ReactNode;
  allowedRoles: HealthFlowRole[];
};

function roleAllowed(userRole: HealthFlowRole, allowed: HealthFlowRole[]): boolean {
  if (allowed.includes(userRole)) return true;
  if (userRole === "SUPER_ADMIN" && allowed.includes("ADMIN")) return true;
  return false;
}

export function ProtectedRolePage({ children, allowedRoles }: ProtectedRolePageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<HealthFlowUser | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  const allowedKey = allowedRoles.join(",");

  useEffect(() => {
    let active = true;
    const verify = async (): Promise<void> => {
      const guest = getGuestUser();
      if (guest) {
        if (!roleAllowed(guest.role, allowedRoles)) {
          if (active) {
            setDenied(true);
            setReady(true);
            router.replace(roleDashboardPath(guest.role));
          }
          return;
        }
        if (active) {
          setUser(guest);
          setReady(true);
        }
        return;
      }

      try {
        const res = await apiRequest<{ user: HealthFlowUser }>("/auth/me");
        if (!active) return;
        if (!roleAllowed(res.user.role, allowedRoles)) {
          setDenied(true);
          setReady(true);
          router.replace(roleDashboardPath(res.user.role));
          return;
        }
        setUser(res.user);
        setReady(true);
      } catch {
        if (active) {
          setDenied(true);
          setReady(true);
          router.replace("/login");
        }
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, [allowedKey, allowedRoles, pathname, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (denied || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Redirecting...</p>
      </div>
    );
  }

  return <RoleShell>{children}</RoleShell>;
}

export function useHealthFlowUser(): HealthFlowUser | null {
  const [user, setUser] = useState<HealthFlowUser | null>(null);
  useEffect(() => {
    const guest = getGuestUser();
    if (guest) {
      setUser(guest);
      return;
    }
    apiRequest<{ user: HealthFlowUser }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));
  }, []);
  return user;
}

export { normalizeRole, roleDashboardPath, roleLoginPath };
