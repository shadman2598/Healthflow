"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { appointmentContextSnippet, buildClinicianActions, provenance } from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconClipboard } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
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

export default function DoctorCockpitPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["DOCTOR"]}>
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
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
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
        const [me, todayRes, threadRes] = await Promise.all([
          apiRequest<{ user: HealthFlowUser }>("/auth/me"),
          apiRequest<{ appointments: HealthFlowAppointment[] }>(
            `/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`
          ),
          apiRequest<{ threads: MessageThread[] }>("/messages/threads")
        ]);
        setDoctorProfileId(me.user.doctorProfile?.id ?? null);
        setAppointments(todayRes.appointments);
        setThreads(threadRes.threads);
        void apiRequest("/analytics/events", {
          method: "POST",
          body: { name: "clinician_prep_opened", resourceType: "Appointment", resourceId: focusId ?? "today" }
        }).catch(() => undefined);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [focusId]);

  const focus =
    appointments.find((a) => a.id === focusId) ??
    appointments
      .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ??
    null;

  const actions = useMemo(
    () =>
      buildClinicianActions({
        doctorProfileId,
        todayAppointments: appointments.map((a) => ({
          id: a.id,
          scheduledAt: a.scheduledAt,
          status: a.status,
          reason: a.reason,
          category: a.category,
          patientName: a.patient
            ? `${a.patient.firstName} ${a.patient.lastName}`
            : a.profile
              ? `${a.profile.firstName} ${a.profile.lastName}`
              : "Patient"
        })),
        threads: threads.map((t) => ({
          id: t.id,
          status: t.status,
          subject: t.subject,
          assignedDoctorId: t.assignedDoctorId
        }))
      }),
    [appointments, threads, doctorProfileId]
  );

  const patientName = focus?.patient
    ? `${focus.patient.firstName} ${focus.patient.lastName}`
    : focus?.profile
      ? `${focus.profile.firstName} ${focus.profile.lastName}`
      : "Patient";

  const whyHere = focus?.reason ?? focus?.category?.replace(/_/g, " ") ?? "Visit";
  const context = focus
    ? appointmentContextSnippet({
        reason: focus.reason,
        category: focus.category,
        scheduledAt: focus.scheduledAt,
        patientNotes: focus.patientNotes
      })
    : "";

  const provenanceRows = focus
    ? [
        provenance({
          field: "appointment.reason",
          valueSummary: whyHere,
          source: focus.reason ? "receptionist_entered" : "system_generated",
          actorRole: "RECEPTIONIST",
          resourceType: "Appointment",
          resourceId: focus.id
        }),
        ...(focus.patientNotes
          ? [
              provenance({
                field: "appointment.patientNotes",
                valueSummary: focus.patientNotes.slice(0, 120),
                source: "patient_provided",
                actorRole: "PATIENT",
                resourceType: "Appointment",
                resourceId: focus.id
              })
            ]
          : [])
      ]
    : [];

  const relatedThreads = threads
    .filter((t) => {
      if (!focus?.profile?.id) return t.status === "PENDING" || t.status === "UNREAD";
      return t.patientProfileId === focus.profile.id;
    })
    .slice(0, 4);

  return (
    <ProtectedRolePage allowedRoles={["DOCTOR"]}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clinician cockpit</h1>
          <p className="mt-1 text-sm text-slate-500">Who · Why · What changed · What next</p>
        </div>
        <Link href="/doctor/dashboard" className="btn-secondary text-sm">
          Back to dashboard
        </Link>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading cockpit</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {focus ? (
              <section className="card p-6" aria-labelledby="encounter-heading">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Current encounter</p>
                <h2 id="encounter-heading" className="mt-1 text-xl font-semibold text-slate-900">
                  {patientName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDateTime(focus.scheduledAt)} · {whyHere}
                </p>
                <div className="mt-3">
                  <AppointmentStatusBadge status={focus.status} />
                  {focus.checkedInAt ? (
                    <span className="ml-2 text-xs text-teal-700">Checked in {formatTime(focus.checkedInAt)}</span>
                  ) : null}
                </div>

                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Why are they here?</dt>
                    <dd className="mt-1 text-sm text-slate-900">{whyHere}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Patient notes</dt>
                    <dd className="mt-1 text-sm text-slate-900">{focus.patientNotes || "None on file"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Forwarded context</dt>
                    <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      {context || "No prior structured context."}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href="/messages" className="btn-primary text-sm">
                    <IconChat className="h-4 w-4" /> Message
                  </Link>
                  {focus.profile?.id ? (
                    <Link
                      href={`/interop/fhir/Patient/${focus.profile.id}`}
                      className="btn-secondary text-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        void apiRequest(`/interop/fhir/Patient/${focus.profile!.id}`).then((res) => {
                          const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `patient-${focus.profile!.id}.fhir.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        });
                      }}
                    >
                      Export FHIR Patient
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : (
              <EmptyState
                icon={<IconCalendar className="h-10 w-10" />}
                title="No encounter selected"
                description="Open a visit from today’s schedule to see the prep brief."
              />
            )}

            <section className="card p-6" aria-labelledby="provenance-heading">
              <h2 id="provenance-heading" className="text-sm font-semibold text-slate-900">
                Information provenance
              </h2>
              <p className="mt-1 text-xs text-slate-500">Where key facts came from — avoid re-asking.</p>
              {provenanceRows.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No provenance rows for this encounter.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {provenanceRows.map((row) => (
                    <li key={row.field} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <p className="font-medium text-slate-900">{row.field}</p>
                      <p className="text-slate-600">{row.valueSummary}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {row.source} · {row.actorRole ?? "unknown"} · {new Date(row.collectedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="card p-5" aria-labelledby="clinician-next">
              <h2 id="clinician-next" className="text-sm font-semibold text-slate-900">
                Next actions
              </h2>
              <ul className="mt-3 space-y-2">
                {actions.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="block rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-brand-50">
                      <span className="font-medium text-slate-900">{a.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{a.reason}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5" aria-labelledby="today-list">
              <h2 id="today-list" className="text-sm font-semibold text-slate-900">
                Today&apos;s schedule
              </h2>
              <div className="mt-3 divide-y divide-slate-100">
                {appointments.length === 0 ? (
                  <p className="py-3 text-sm text-slate-500">No visits today.</p>
                ) : (
                  appointments.map((a) => (
                    <Link
                      key={a.id}
                      href={`/doctor/cockpit?appointmentId=${a.id}`}
                      className="flex items-center justify-between py-3 text-sm hover:bg-slate-50"
                    >
                      <span>
                        {formatTime(a.scheduledAt)} ·{" "}
                        {a.patient
                          ? `${a.patient.firstName} ${a.patient.lastName}`
                          : a.profile
                            ? `${a.profile.firstName} ${a.profile.lastName}`
                            : "Patient"}
                      </span>
                      <AppointmentStatusBadge status={a.status} />
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="card p-5" aria-labelledby="msgs">
              <h2 id="msgs" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <IconClipboard className="h-4 w-4" /> Related messages
              </h2>
              <div className="mt-3 space-y-2">
                {relatedThreads.length === 0 ? (
                  <p className="text-sm text-slate-500">No related threads.</p>
                ) : (
                  relatedThreads.map((t) => (
                    <Link key={t.id} href="/messages" className="block text-sm text-brand-700 underline">
                      {t.subject}
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </ProtectedRolePage>
  );
}
