"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "../lib/api";
import { getGuestUser, isGuestSession } from "../lib/guest-session";
import { roleDashboardPath } from "../lib/role-config";
import type { HealthFlowRole, HealthFlowUser } from "../types/healthflow";

const STAFF_ROLES: HealthFlowRole[] = ["RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"];

type AuthGuardProps = {
  children: React.ReactNode;
  /** When true, only clinic staff may proceed; patients are sent to their portal. */
  staffOnly?: boolean;
};

export function AuthGuard({ children, staffOnly = false }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    const verify = async (): Promise<void> => {
      if (isGuestSession()) {
        const guest = getGuestUser();
        if (staffOnly && guest && !STAFF_ROLES.includes(guest.role)) {
          if (active) {
            setAllowed(false);
            setReady(true);
            router.replace(roleDashboardPath(guest.role));
          }
          return;
        }
        if (active) {
          setAllowed(true);
          setReady(true);
        }
        return;
      }
      try {
        const res = await apiRequest<{ user: HealthFlowUser }>("/auth/me");
        if (!active) return;
        if (staffOnly && !STAFF_ROLES.includes(res.user.role)) {
          setAllowed(false);
          setReady(true);
          router.replace(roleDashboardPath(res.user.role));
          return;
        }
        setAllowed(true);
        setReady(true);
      } catch {
        if (active) {
          setAllowed(false);
          setReady(true);
          if (pathname !== "/login") router.replace("/login");
        }
      }
    };
    void verify();
    return () => {
      active = false;
    };
  }, [pathname, router, staffOnly]);

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

  if (!allowed) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Redirecting...</p>
      </div>
    );
  }

  return <>{children}</>;
}
