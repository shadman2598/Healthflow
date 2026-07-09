"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "../lib/api";
import { useToast } from "../contexts/toast-context";
import type { Clinic, User } from "../types/api";
import {
  IconDashboard,
  IconCalendar,
  IconUsers,
  IconChat,
  IconSettings,
  IconBell,
  IconSearch,
  IconLogOut,
  IconShield
} from "./ui/Icons";
import { Avatar } from "./ui/Avatar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconDashboard className="h-5 w-5" />, group: "main" },
  { href: "/appointments", label: "Appointments", icon: <IconCalendar className="h-5 w-5" />, group: "main" },
  { href: "/patients", label: "Patients", icon: <IconUsers className="h-5 w-5" />, group: "main" },
  { href: "/messages", label: "Messages", icon: <IconChat className="h-5 w-5" />, group: "main" },
  { href: "/settings/reminders", label: "Settings", icon: <IconSettings className="h-5 w-5" />, group: "other" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);

  useEffect(() => {
    const loadAuthContext = async (): Promise<void> => {
      try {
        const [meRes, clinicsRes] = await Promise.all([
          apiRequest<{ user: User }>("/auth/me"),
          apiRequest<{ clinics: Clinic[]; activeOrganizationId: string }>("/auth/clinics")
        ]);
        setUser(meRes.user);
        setClinics(clinicsRes.clinics);
      } catch {
        /* auth guard handles redirect */
      }
    };
    void loadAuthContext();
  }, [pathname]);

  const logout = async (): Promise<void> => {
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const mainNav = navItems.filter((n) => n.group === "main");
  const otherNav = navItems.filter((n) => n.group === "other");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <IconShield className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-slate-900">Technovate</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={isActive(item.href) ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="my-4 border-t border-slate-100" />

          <div className="space-y-1">
            {otherNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={isActive(item.href) ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-slate-100 px-3 py-3">
          {user?.role === "ADMIN" && clinics.length > 1 ? (
            <select
              className="mb-2 w-full text-xs"
              value={user.activeOrganizationId}
              onChange={(e) => void onClinicChange(e.target.value)}
            >
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
          ) : null}
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={user?.email ?? "U"} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.email ?? "..."}</p>
              <p className="text-xs text-slate-500">{user?.role ?? ""}</p>
            </div>
            <button
              onClick={() => void logout()}
              className="btn-icon shrink-0"
              title="Sign out"
            >
              <IconLogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search patients, appointments..."
              className="w-80 border-0 bg-slate-50 pl-10 text-sm shadow-none focus:ring-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-icon relative">
              <IconBell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
