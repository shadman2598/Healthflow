"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { clearGuestSession, getGuestUser, isGuestSession } from "../../lib/guest-session";
import { roleHasPermission } from "../../lib/permissions";
import { normalizeRole, ROLE_NAV, type NavIconKey } from "../../lib/role-config";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowUser, Organization } from "../../types/healthflow";
import { Avatar } from "../ui/Avatar";
import {
  IconAlertTriangle,
  IconCalendar,
  IconChat,
  IconClipboard,
  IconDashboard,
  IconHelp,
  IconLogOut,
  IconSearch,
  IconSettings,
  IconShield,
  IconUsers
} from "../ui/Icons";

const NAV_PERMISSION: Partial<Record<string, Parameters<typeof roleHasPermission>[1]>> = {
  "/admin/audit-logs": "audit:read",
  "/admin/staff": "staff:manage",
  "/admin/settings": "clinic:settings",
  "/settings/reminders": "reminder:manage_rules"
};

const iconMap: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: IconDashboard,
  calendar: IconCalendar,
  chat: IconChat,
  search: IconSearch,
  users: IconUsers,
  shield: IconShield,
  alert: IconAlertTriangle,
  settings: IconSettings,
  help: IconHelp,
  clipboard: IconClipboard
};

type RoleShellProps = {
  children: React.ReactNode;
};

export function RoleShell({ children }: RoleShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  // Start null on server + client to avoid hydration mismatch (guest uses localStorage).
  const [user, setUser] = useState<HealthFlowUser | null>(null);
  const [clinics, setClinics] = useState<Organization[]>([]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const guest = getGuestUser();
      if (guest) {
        setUser(guest);
        setClinics([guest.organization]);
        return;
      }
      try {
        const [meRes, clinicsRes] = await Promise.all([
          apiRequest<{ user: HealthFlowUser }>("/auth/me"),
          apiRequest<{ clinics: Organization[]; activeOrganizationId: string }>("/auth/clinics").catch(() => ({
            clinics: [],
            activeOrganizationId: ""
          }))
        ]);
        setUser(meRes.user);
        setClinics(clinicsRes.clinics);
      } catch {
        /* auth guard handles redirect */
      }
    };
    void load();
  }, [pathname]);

  const logout = async (): Promise<void> => {
    if (isGuestSession()) {
      clearGuestSession();
      router.replace("/");
      return;
    }
    try {
      await apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      showToast("Logout failed", "error");
    }
  };

  const onClinicChange = async (organizationId: string): Promise<void> => {
    try {
      await apiRequest("/auth/select-clinic", { method: "POST", body: { organizationId } });
      setUser((prev) => (prev ? { ...prev, activeOrganizationId: organizationId } : prev));
      showToast("Clinic switched");
      router.refresh();
    } catch {
      showToast("Failed to switch clinic", "error");
    }
  };

  const navRole = user ? normalizeRole(user.role) : "PATIENT";
  const navItems = ROLE_NAV[navRole].filter((item) => {
    const needed = NAV_PERMISSION[item.href];
    if (!needed || !user) return true;
    return roleHasPermission(user.role, needed);
  });
  const canSwitchClinic = user ? roleHasPermission(user.role, "clinic:switch_org") : false;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const displayName =
    user?.patientProfile
      ? `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
      : user?.doctorProfile
        ? `Dr. ${user.doctorProfile.lastName}`
        : user?.staffProfile
          ? `${user.staffProfile.firstName} ${user.staffProfile.lastName}`
          : user?.email ?? "User";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white" aria-label="Clinic navigation">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600" aria-hidden>
            <IconShield className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-[15px] font-semibold text-slate-900">HealthFlow</span>
            <p className="text-xs font-medium uppercase tracking-wider text-teal-700">{navRole.toLowerCase()}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <span className={active ? "text-brand-600" : "text-slate-500 group-hover:text-slate-600"} aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 px-3 py-3">
          {canSwitchClinic && clinics.length > 1 && user ? (
            <div className="mb-2">
              <label htmlFor="clinic-switcher" className="sr-only">
                Active clinic
              </label>
              <select
                id="clinic-switcher"
                className="w-full min-h-[44px] text-sm"
                value={user.activeOrganizationId}
                onChange={(e) => void onClinicChange(e.target.value)}
              >
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
              <p className="text-xs text-slate-600">
                {isGuestSession() ? "Guest preview" : user?.organization?.name ?? user?.role ?? ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn-icon shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <IconLogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-teal-700">HealthFlow</p>
            <p className="text-sm text-slate-600">
              {isGuestSession()
                ? "Guest preview — browse features without an account"
                : user?.organization?.name ?? "Loading..."}
            </p>
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-y-auto p-8" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
