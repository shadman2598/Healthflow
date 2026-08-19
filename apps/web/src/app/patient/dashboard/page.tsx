"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { WhatsNextCard } from "../../../components/healthflow/WhatsNextCard";
import { DashboardCard } from "../../../components/healthflow/DashboardCard";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconClipboard } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import { getLocalPrepProgress, prepVisitHref, resolvePatientNextStep } from "../../../lib/patient-journey";
import type { HealthFlowAppointment, MessageThread } from "../../../types/healthflow";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pickNextVisitIdFromList(appointments: HealthFlowAppointment[]): string | undefined {
  const active = new Set(["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"]);
  const next = [...appointments]
    .filter((a) => active.has(a.status) && new Date(a.scheduledAt).getTime() >= Date.now() - 60_000)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
  return next?.id;
}

export default function PatientDashboardPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const { isGuestSession } = await import("../../../lib/guest-session");
    if (isGuestSession()) {
      setIsGuest(true);
      setAppointments([]);
      setAllAppointments([]);
      setThreads([]);
      setLoadError(null);
      return;
    }
    const now = new Date().toISOString();
    const [apptRes, allApptRes, threadRes] = await Promise.all([
      apiRequest<{ appointments: HealthFlowAppointment[] }>(`/appointments?from=${encodeURIComponent(now)}`),
      apiRequest<{ appointments: HealthFlowAppointment[] }>("/appointments"),
      apiRequest<{ threads: MessageThread[] }>("/messages/threads")
    ]);
    setIsGuest(false);
    setAppointments(apptRes.appointments.slice(0, 5));
    setAllAppointments(allApptRes.appointments);
    setThreads(threadRes.threads.slice(0, 8));
    setLoadError(null);
  };

  useEffect(() => {
    void load()
      .catch(() => {
        setLoadError(
          "We couldn’t load your care journey. Your appointments were not changed. Retry or contact reception."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const sourceAppts = allAppointments.length ? allAppointments : appointments;
  const nextId = pickNextVisitIdFromList(sourceAppts);
  const journeyStep = useMemo(
    () =>
      resolvePatientNextStep({
        isGuest,
        appointments: sourceAppts.map((a) => ({
          id: a.id,
          scheduledAt: a.scheduledAt,
          status: a.status,
          reason: a.reason,
          category: a.category,
          checkedInAt: a.checkedInAt,
          doctor: a.doctor
            ? { firstName: a.doctor.firstName, lastName: a.doctor.lastName }
            : null
        })),
        threads,
        prepProgress: getLocalPrepProgress(nextId)
      }),
    [isGuest, sourceAppts, threads, nextId]
  );

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Home</h1>
        <p className="mt-2 text-lg text-slate-600">What do you need? Tap one big button.</p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Link href="/patient/book" className="rounded-2xl bg-teal-600 px-4 py-6 text-center text-xl font-semibold text-white">
          Book a visit
        </Link>
        <Link href="/patient/visits" className="rounded-2xl bg-slate-900 px-4 py-6 text-center text-xl font-semibold text-white">
          My visits
        </Link>
        <Link href="/faq" className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-6 text-center text-xl font-semibold text-slate-900">
          Help
        </Link>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading your care journey</span>
        </div>
      ) : (
        <>
          {loadError ? (
            <div
              className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-medium">Couldn’t refresh your journey</p>
              <p className="mt-1">{loadError}</p>
              <button
                type="button"
                className="btn-secondary mt-3 text-sm"
                onClick={() => {
                  setLoading(true);
                  void load()
                    .catch(() => {
                      setLoadError(
                        "We couldn’t load your care journey. Your appointments were not changed. Retry or contact reception."
                      );
                    })
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          <WhatsNextCard step={journeyStep} className="mb-8" />

          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardCard title="Coming soon" href="/patient/visits">
              {appointments.length === 0 ? (
                <EmptyState
                  icon={<IconCalendar className="h-10 w-10" />}
                  title="No visits yet"
                  description="Tap Book a visit. A checkup only needs a day and morning or afternoon."
                />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {appointments.map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between px-6 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatDateTime(appt.scheduledAt)}</p>
                        <p className="text-xs text-slate-500">{appt.reason ?? appt.category.replace("_", " ")}</p>
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Messages" href="/messages">
              {threads.length === 0 ? (
                <EmptyState
                  icon={<IconChat className="h-10 w-10" />}
                  title="No messages yet"
                  description="When the clinic needs you, it shows up here and in your next step."
                />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {threads.slice(0, 3).map((thread) => (
                    <div key={thread.id} className="px-6 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{thread.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {thread.status.toLowerCase()} · {thread.priority.toLowerCase()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          {journeyStep.id === "prep_visit" || journeyStep.id === "confirm_visit" ? (
            <div className="mt-8 card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <IconClipboard className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Need clinic answers?</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Fees, what to bring, and when to message — without leaving your visit path.
                    </p>
                  </div>
                </div>
                <Link href={nextId ? prepVisitHref(nextId) : "/patient/care-guide"} className="btn-secondary text-sm">
                  Open Care Guide
                </Link>
              </div>
            </div>
          ) : null}
        </>
      )}
    </ProtectedRolePage>
  );
}
