"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { roleDashboardPath } from "../../lib/role-config";
import type { HealthFlowUser } from "../../types/healthflow";
import { IconShield } from "../ui/Icons";
import { cn } from "../../lib/utils";

type RoleOption = {
  id: "patient" | "doctor" | "receptionist";
  label: string;
  description: string;
  signInHref: string;
  signUpHref: string;
  bubbleClass: string;
  letterClass: string;
};

const ROLES: RoleOption[] = [
  {
    id: "patient",
    label: "Patient",
    description: "View your appointments, message the clinic, and manage your care.",
    signInHref: "/login/patient",
    signUpHref: "/signup/patient",
    bubbleClass: "from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-teal-500/25",
    letterClass: "text-teal-50"
  },
  {
    id: "doctor",
    label: "Doctor",
    description: "Review your schedule, assigned patients, and patient messages.",
    signInHref: "/login/doctor",
    signUpHref: "/signup/doctor",
    bubbleClass: "from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 shadow-brand-600/25",
    letterClass: "text-brand-50"
  },
  {
    id: "receptionist",
    label: "Receptionist",
    description: "Manage patients, scheduling, messages, and clinic reminders.",
    signInHref: "/login/receptionist",
    signUpHref: "/signup/receptionist",
    bubbleClass: "from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 shadow-slate-600/25",
    letterClass: "text-slate-50"
  }
];

export function WhoAreYouPage() {
  const router = useRouter();

  useEffect(() => {
    apiRequest<{ user: HealthFlowUser }>("/auth/me")
      .then((res) => router.replace(res.user.redirectTo ?? roleDashboardPath(res.user.role)))
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-brand-50/20 to-teal-50/30">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-teal-600 shadow-md">
            <IconShield className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">HealthFlow</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Who are you?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-slate-500">
            Choose your role to sign in or create an account. Each portal shows only what you need.
          </p>
        </div>

        {/* Role bubbles */}
        <div className="grid gap-6 sm:grid-cols-3">
          {ROLES.map((role) => (
            <div
              key={role.id}
              className={cn(
                "flex flex-col items-center rounded-3xl bg-gradient-to-b p-8 text-center shadow-lg transition-transform hover:-translate-y-1",
                role.bubbleClass
              )}
            >
              {/* Block letter label */}
              <span
                className={cn(
                  "select-none text-3xl font-black uppercase leading-none tracking-tighter sm:text-4xl",
                  role.letterClass
                )}
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                {role.label}
              </span>

              <p className="mt-4 text-sm leading-relaxed text-white/80">{role.description}</p>

              <div className="mt-8 flex w-full flex-col gap-2.5">
                <Link
                  href={role.signInHref}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-900 shadow-sm transition hover:bg-white/90"
                >
                  Sign In
                </Link>
                <Link
                  href={role.signUpHref}
                  className="inline-flex items-center justify-center rounded-xl border-2 border-white/40 bg-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/20"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Footer notes */}
        <div className="mt-10 space-y-3 text-center">
          <p className="text-xs text-slate-400">
            Staff sign up requires a clinic invite code. Patients can register directly.
          </p>
          <p className="text-xs text-slate-400">
            Clinic administrator?{" "}
            <Link href="/login/admin" className="font-medium text-brand-600 hover:text-brand-700">
              Admin sign in
            </Link>
          </p>
          <p className="text-xs text-slate-400">
            This app supports clinic workflow only — not diagnosis or emergency care.
          </p>
        </div>
      </div>
    </div>
  );
}
