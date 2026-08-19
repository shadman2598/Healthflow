"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildClinicianBrief,
  buildVisitPropagationBundle,
  measureCockpitClicks,
  provenance,
  type CockpitPriorVisit,
  type CockpitPriority,
  type CockpitVisit,
  type DataProvenance
} from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { ProvenanceTrail } from "../../../components/healthflow/ProvenanceTrail";
import { AiSafetyBanner } from "../../../components/healthflow/AiSafetyBanner";
import { NextActionsPanel } from "../../../components/healthflow/NextActionsPanel";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconClipboard } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import type { HealthFlowAppointment, HealthFlowUser, MessageThread } from "../../../types/healthflow";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function priorityClass(p: CockpitPriority): string {
  switch (p) {
    case "critical":
      return "border-amber-200 bg-amber-50";
    case "high":
      return "border-teal-100 bg-teal-50/60";
    case "external":
      return "border-slate-200 bg-slate-50";
    case "low":
      return "border-transparent bg-white";
    default:
      return "border-slate-100 bg-white";
  }
}

type ProfileDetail = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  healthcareNumber?: string;
  dateOfBirth?: string | null;
  appointments?: HealthFlowAppointment[];
};

function toVisit(a: HealthFlowAppointment, profile?: ProfileDetail | null): CockpitVisit {
  return {
    id: a.id,
    scheduledAt: a.scheduledAt,
    status: a.status,
    reason: a.reason,
    category: a.category,
    patientNotes: a.patientNotes,
    staffNotes: a.staffNotes,
    checkedInAt: a.checkedInAt,
    profileId: a.profile?.id ?? profile?.id ?? null,
    dateOfBirth: profile?.dateOfBirth ?? a.profile?.dateOfBirth,
    phone: profile?.phone ?? a.profile?.phone,
    healthcareNumberMasked: profile?.healthcareNumber ?? a.profile?.healthcareNumber,
    patientName: a.patient
      ? `${a.patient.firstName} ${a.patient.lastName}`
      : a.profile
        ? `${a.profile.firstName} ${a.profile.lastName}`
        : profile
          ? `${profile.firstName} ${profile.lastName}`
          : "Patient"
  };
}

export default function DoctorCockpitPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["DOCTOR"]}>
          <div className="flex h-48 items-center justify-center" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <span className="sr-only">Loading clinician cockpit</span>
          </div>
        </ProtectedRolePage>
      }
    >
      <DoctorCockpitContent />
    </Suspense>
  );
}

function DoctorCockpitContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("appointmentId");
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [priorVisits, setPriorVisits] = useState<CockpitPriorVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadToday = async (): Promise<{
    today: HealthFlowAppointment[];
    threads: MessageThread[];
  }> => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const [todayRes, threadRes] = await Promise.all([
      apiRequest<{ appointments: HealthFlowAppointment[] }>(
        `/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`
      ),
      apiRequest<{ threads: MessageThread[] }>("/messages/threads")
    ]);
    return { today: todayRes.appointments, threads: threadRes.threads };
  };

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      setLoading(true);
      try {
        const { isGuestSession } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setAppointments([]);
          setThreads([]);
          setLoadError(null);
          return;
        }
        await apiRequest<{ user: HealthFlowUser }>("/auth/me");
        const { today, threads: inbox } = await loadToday();
        if (!active) return;
        setAppointments(today);
        setThreads(inbox);
        setLoadError(null);

        const focusAppt =
          today.find((a) => a.id === focusId) ??
          today
            .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ??
          null;

        const profileId = focusAppt?.profile?.id;
        if (profileId) {
          const res = await apiRequest<{ profile: ProfileDetail }>(`/patient-profiles/${profileId}`).catch(
            () => null
          );
          if (!active) return;
          if (res?.profile) {
            setProfile(res.profile);
            setPriorVisits(
              (res.profile.appointments ?? [])
                .filter((a) => a.id !== focusAppt?.id)
                .map((a) => ({
                  id: a.id,
                  scheduledAt: a.scheduledAt,
                  status: a.status,
                  reason: a.reason,
                  category: a.category
                }))
            );
          } else {
            setProfile(null);
            setPriorVisits([]);
          }
        } else {
          setProfile(null);
          setPriorVisits([]);
        }

        void apiRequest("/analytics/events", {
          method: "POST",
          body: { name: "clinician_prep_opened", resourceType: "Appointment", resourceId: focusId ?? "today" }
        }).catch(() => undefined);
      } catch (error) {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Couldn’t load the cockpit. Patient data was not changed — retry."
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [focusId]);

  const focusAppt =
    appointments.find((a) => a.id === focusId) ??
    appointments
      .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ??
    null;

  const brief = useMemo(
    () =>
      buildClinicianBrief({
        focus: focusAppt ? toVisit(focusAppt, profile) : null,
        todaySchedule: appointments.map((a) => toVisit(a, a.profile?.id === profile?.id ? profile : null)),
        priorVisits,
        threads: threads.map((t) => ({
          id: t.id,
          status: t.status,
          subject: t.subject,
          patientProfileId: t.patientProfileId,
          assignedDoctorId: t.assignedDoctorId
        }))
      }),
    [focusAppt, appointments, profile, priorVisits, threads]
  );

  const propagation = useMemo(() => {
    if (!focusAppt) return null;
    return buildVisitPropagationBundle({
      reason: focusAppt.reason,
      category: focusAppt.category,
      scheduledAt: focusAppt.scheduledAt,
      patientNotes: focusAppt.patientNotes,
      staffNotes: focusAppt.staffNotes,
      patientName: brief.patientName
    });
  }, [focusAppt, brief.patientName]);

  const provenanceRows: DataProvenance[] = useMemo(() => {
    if (!focusAppt) return [];
    const rows: DataProvenance[] = [];
    if (focusAppt.reason) {
      rows.push(
        provenance({
          field: "appointment.reason",
          valueSummary: focusAppt.reason,
          source: "receptionist_entered",
          actorRole: "RECEPTIONIST",
          resourceType: "Appointment",
          resourceId: focusAppt.id
        })
      );
    }
    if (focusAppt.patientNotes) {
      rows.push(
        provenance({
          field: "appointment.patientNotes",
          valueSummary: focusAppt.patientNotes.slice(0, 160),
          source: "patient_provided",
          actorRole: "PATIENT",
          resourceType: "Appointment",
          resourceId: focusAppt.id
        })
      );
    }
    if (focusAppt.staffNotes) {
      rows.push(
        provenance({
          field: "appointment.staffNotes",
          valueSummary: focusAppt.staffNotes.slice(0, 160),
          source: "receptionist_entered",
          actorRole: "RECEPTIONIST",
          resourceType: "Appointment",
          resourceId: focusAppt.id
        })
      );
    }
    return rows;
  }, [focusAppt]);

  /** Primary clinical lanes first; external SoR collapsed visually lower. */
  const primarySections = brief.sections.filter((s) =>
    ["who", "why", "prep", "history", "changed", "today", "patient_reported", "pending_tasks", "follow_up"].includes(
      s.id
    )
  );
  const externalSections = brief.sections.filter((s) =>
    ["medications", "allergies", "results", "documents"].includes(s.id)
  );

  return (
    <ProtectedRolePage allowedRoles={["DOCTOR"]}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clinician cockpit</h1>
          <p className="mt-1 text-sm text-slate-500">
            Who · Why · What happened · What changed · What matters today · What next — ~{brief.prepScanSeconds}s
            scan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-500">
            Next patient:{" "}
            <span className="font-semibold text-slate-700">{measureCockpitClicks("openNextPatient")} click</span>
          </p>
          <Link href="/doctor/dashboard" className="btn-secondary text-sm">
            Clinician home
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading cockpit</span>
        </div>
      ) : (
        <>
          {loadError ? (
            <div
              className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-medium">Cockpit refresh failed</p>
              <p className="mt-1">{loadError}</p>
              <button
                type="button"
                className="btn-secondary mt-3 text-sm"
                onClick={() => {
                  setLoading(true);
                  setLoadError(null);
                  window.location.reload();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {focusAppt ? (
                <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-6" aria-labelledby="encounter-heading">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Current encounter</p>
                  <h2 id="encounter-heading" className="mt-1 text-xl font-semibold text-slate-900">
                    {brief.headline.who}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDateTime(focusAppt.scheduledAt)} · {brief.headline.why}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <AppointmentStatusBadge status={focusAppt.status} />
                    {focusAppt.checkedInAt ? (
                      <span className="text-xs text-teal-700">Checked in {formatTime(focusAppt.checkedInAt)}</span>
                    ) : null}
                  </div>

                  <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["Who", brief.headline.who],
                        ["Why here", brief.headline.why],
                        ["Previously", brief.headline.previously],
                        ["What changed", brief.headline.changed],
                        ["Important today", brief.headline.today],
                        ["What next", brief.headline.next]
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/80 bg-white/70 px-3 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                        <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : (
                <EmptyState
                  icon={<IconCalendar className="h-10 w-10" />}
                  title="No encounter selected"
                  description="Open a visit from today’s schedule — one click to load the brief."
                />
              )}

              <div className="space-y-4">
                {primarySections.map((section) => (
                  <section
                    key={section.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    aria-labelledby={`sec-${section.id}`}
                  >
                    <h2 id={`sec-${section.id}`} className="text-sm font-semibold text-slate-900">
                      {section.title}
                    </h2>
                    <p className="text-xs text-slate-500">{section.purpose}</p>
                    <ul className="mt-3 space-y-2">
                      {section.facts.map((fact) => (
                        <li
                          key={fact.id}
                          className={cn("rounded-lg border px-3 py-2 text-sm", priorityClass(fact.priority))}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {fact.label}
                            {fact.source ? ` · ${fact.source}` : ""}
                          </p>
                          {fact.href ? (
                            <Link href={fact.href} className="mt-0.5 block font-medium text-brand-700 hover:underline">
                              {fact.value}
                            </Link>
                          ) : (
                            <p className="mt-0.5 text-slate-900">{fact.value}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4" aria-labelledby="ext-heading">
                <h2 id="ext-heading" className="text-sm font-semibold text-slate-900">
                  External clinical systems
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Meds, allergies, results, and documents stay in the EHR — HealthFlow will not invent them.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {externalSections.map((section) => (
                    <div key={section.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-700">{section.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{section.facts[0]?.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <ProvenanceTrail rows={provenanceRows} />
            </div>

            <div className="space-y-6">
              <AiSafetyBanner tier="CLINICAL_ASSISTANCE" status="human review required" />
              <NextActionsPanel title="NEXT_ACTION — clinician" />

              <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="clinician-next">
                <h2 id="clinician-next" className="text-sm font-semibold text-slate-900">
                  Next actions
                </h2>
                <ul className="mt-3 space-y-2">
                  {brief.nextActions.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        className="block rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-brand-50"
                      >
                        <span className="font-medium text-slate-900">{a.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {a.reason} · {a.clicks} click
                        </span>
                      </Link>
                    </li>
                  ))}
                  {propagation ? (
                    <li>
                      <Link
                        href={`/messages?draft=${encodeURIComponent(propagation.messageDraft)}`}
                        className="block rounded-lg bg-teal-50 px-3 py-2 text-sm hover:bg-teal-100"
                      >
                        <span className="font-medium text-slate-900">Message with visit context</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Propagates reason/notes — no re-typing · {measureCockpitClicks("draftFollowUp")} click
                        </span>
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="today-list">
                <h2 id="today-list" className="text-sm font-semibold text-slate-900">
                  Today&apos;s schedule
                </h2>
                <div className="mt-3 divide-y divide-slate-100">
                  {brief.schedule.length === 0 ? (
                    <p className="py-3 text-sm text-slate-500">No visits today.</p>
                  ) : (
                    brief.schedule.map((a) => (
                      <Link
                        key={a.id}
                        href={a.href}
                        className={cn(
                          "flex items-center justify-between py-3 text-sm hover:bg-slate-50",
                          a.isFocus && "bg-teal-50/80"
                        )}
                        aria-current={a.isFocus ? "true" : undefined}
                      >
                        <span>
                          {a.time} · {a.label}
                          {a.checkedIn ? (
                            <span className="ml-1 text-[10px] font-medium uppercase text-teal-700">in</span>
                          ) : null}
                        </span>
                        <AppointmentStatusBadge status={a.status as HealthFlowAppointment["status"]} />
                      </Link>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="eff">
                <h2 id="eff" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <IconClipboard className="h-4 w-4" aria-hidden /> Workflow budget
                </h2>
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  <li>Open next patient — {measureCockpitClicks("openNextPatient")} click</li>
                  <li>Related message — {measureCockpitClicks("openRelatedMessage")} click</li>
                  <li>Patient chart — {measureCockpitClicks("openPatientChart")} click</li>
                  <li>Draft follow-up — {measureCockpitClicks("draftFollowUp")} click</li>
                </ul>
                <Link href="/messages" className="btn-primary mt-4 inline-flex text-sm">
                  <IconChat className="h-4 w-4" aria-hidden /> Messages
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
