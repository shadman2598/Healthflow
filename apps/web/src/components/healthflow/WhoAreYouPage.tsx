"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { parseGuestRole, startGuestSession, type GuestRole } from "../../lib/guest-session";
import { roleDashboardPath } from "../../lib/role-config";
import type { HealthFlowUser } from "../../types/healthflow";
import { COMBINED_MECHANISMS, studyDesignRule } from "@technovate/shared";
import { IconShield } from "../ui/Icons";
import { cn } from "../../lib/utils";
import { DemoAccessGuide } from "./DemoAccessGuide";

type RoleOption = {
  id: GuestRole;
  label: string;
  description: string;
  signInHref: string;
  signUpHref: string;
  guestHref: string;
  bubbleClass: string;
  letterClass: string;
};

const ROLES: RoleOption[] = [
  {
    id: "PATIENT",
    label: "Patient",
    description: "Book a visit in a few taps. See your visits. Ask Helper if you get stuck.",
    signInHref: "/login/patient",
    signUpHref: "/signup/patient",
    guestHref: "/patient/dashboard",
    bubbleClass: "from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-teal-500/25",
    letterClass: "text-teal-50"
  },
  {
    id: "DOCTOR",
    label: "Doctor",
    description: "Review your schedule, assigned patients, and patient messages.",
    signInHref: "/login/doctor",
    signUpHref: "/signup/doctor",
    guestHref: "/doctor/dashboard",
    bubbleClass: "from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 shadow-brand-600/25",
    letterClass: "text-brand-50"
  },
  {
    id: "RECEPTIONIST",
    label: "Receptionist",
    description: "Manage patients, scheduling, messages, and clinic reminders.",
    signInHref: "/login/receptionist",
    signUpHref: "/signup/receptionist",
    guestHref: "/receptionist/dashboard",
    bubbleClass: "from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 shadow-slate-600/25",
    letterClass: "text-slate-50"
  }
];

export function WhoAreYouPage() {
  const router = useRouter();
  const [startingGuest, setStartingGuest] = useState<GuestRole | null>(null);

  useEffect(() => {
    const guestRole = parseGuestRole(new URLSearchParams(window.location.search).get("guest"));
    if (guestRole) {
      startGuestSession(guestRole);
      router.replace(roleDashboardPath(guestRole));
      return;
    }
    apiRequest<{ user: HealthFlowUser }>("/auth/me")
      .then((res) => {
        const path = res.user.redirectTo ?? roleDashboardPath(res.user.role);
        router.replace(path);
      })
      .catch(() => {});
  }, [router]);

  const continueAsGuest = (role: GuestRole, href: string): void => {
    setStartingGuest(role);
    startGuestSession(role);
    router.replace(href);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-brand-50/20 to-teal-50/30">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-teal-600 shadow-md">
            <IconShield className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">HealthFlow</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Need a clinic visit?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">
            Tap Patient. Pick a day. We put it on the calendar. That is the whole idea.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-base text-slate-500">
            Doctors and reception still have their own doors. Helper can talk if you get stuck.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
            <Link href="/study" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              See the products we studied and the mechanisms we combine
            </Link>
          </p>
        </div>

        <p className="mb-10 text-center text-base text-slate-600">
          Pick a door. Continue as guest to look around that role’s pages. Live clinic data still needs a real account.
        </p>

        <div className="grid gap-6 sm:grid-cols-3">
          {ROLES.map((role) => (
            <div
              key={role.id}
              className={cn(
                "flex flex-col items-center rounded-3xl bg-gradient-to-b p-8 text-center shadow-lg transition-transform hover:-translate-y-1",
                role.bubbleClass
              )}
            >
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
                <button
                  type="button"
                  onClick={() => continueAsGuest(role.id, role.guestHref)}
                  disabled={startingGuest !== null}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-900 shadow-sm transition hover:bg-white/90 disabled:opacity-60"
                >
                  {startingGuest === role.id ? "Opening…" : "Continue as guest"}
                </button>
                <Link
                  href={role.signInHref}
                  className="inline-flex items-center justify-center rounded-xl border-2 border-white/40 bg-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/20"
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

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white/80 p-6 text-left" aria-labelledby="mechanisms-heading">
          <h2 id="mechanisms-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Mechanisms we combine
          </h2>
          <p className="mt-2 text-sm text-slate-600">{studyDesignRule()}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {COMBINED_MECHANISMS.map((item) => (
              <li key={item.id}>
                <Link
                  href="/study"
                  className="block rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:border-brand-200 hover:bg-brand-50/50"
                >
                  <span className="font-medium text-slate-900">{item.mechanism}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">From {item.learnedFrom}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <DemoAccessGuide />

        <div className="mt-6 space-y-3 text-center">
          <p className="text-xs text-slate-400">
            Doctors and receptionists need a clinic invite code to register. Patients can sign up directly.
          </p>
          <p className="text-xs text-slate-400">
            Clinic administrator?{" "}
            <Link href="/login/admin" className="font-medium text-brand-600 hover:text-brand-700">
              Admin sign in
            </Link>
            {" "}(no public sign-up)
          </p>
          <p className="text-xs text-slate-400">
            This app supports clinic workflow only — not diagnosis or emergency care.
          </p>
        </div>
      </div>
    </div>
  );
}
