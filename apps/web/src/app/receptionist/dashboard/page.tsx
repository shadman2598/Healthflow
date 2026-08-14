"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildFrontDeskBoard,
  measureDeskWorkflowClicks,
  profileGapsFromAppointments,
  type DeskInlineAction,
  type DeskItem,
  type OpsAppointment,
  type OpsDoctor,
  type OpsOverdue,
  type OpsThread
} from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { NextActionsPanel } from "../../../components/healthflow/NextActionsPanel";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconUsers } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowAppointment, MessageThread, OverdueCheckup } from "../../../types/healthflow";

function urgencyClass(urgency: DeskItem["urgency"]): string {
  switch (urgency) {
    case "critical":
    case "high":
      return "text-amber-800 bg-amber-50";
    case "low":
      return "text-slate-500 bg-slate-50";
    default:
      return "text-teal-800 bg-teal-50";
  }
}

export default function ReceptionistDashboardPage() {
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [overdue, setOverdue] = useState<OverdueCheckup[]>([]);
  const [doctors, setDoctors] = useState<OpsDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const [todayRes, threadRes, overdueRes, docRes] = await Promise.all([
      apiRequest<{ appointments: HealthFlowAppointment[] }>(
        `/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`
      ),
      apiRequest<{ threads: MessageThread[] }>("/messages/threads"),
      apiRequest<{ overdue: OverdueCheckup[] }>("/patient-profiles/overdue/checkups"),
      apiRequest<{ doctors: { id: string; firstName: string; lastName: string }[] }>("/auth/doctors").catch(
        () => ({ doctors: [] as { id: string; firstName: string; lastName: string }[] })
      )
    ]);
    setAppointments(todayRes.appointments);
    setThreads(threadRes.threads);
    setOverdue(overdueRes.overdue);
    setDoctors(docRes.doctors);
    setLoadError(null);
  }, []);

  useEffect(() => {
    void load()
      .catch(() => {
        setLoadError("Couldn’t refresh the front desk board. Appointments were not changed — retry.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const opsAppointments: OpsAppointment[] = useMemo(
    () =>
      appointments.map((a) => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        reason: a.reason,
        category: a.category,
        profileId: a.profile?.id,
        doctorId: a.doctor?.id,
        checkedInAt: a.checkedInAt,
        patientName: a.patient
          ? `${a.patient.firstName} ${a.patient.lastName}`
          : a.profile
            ? `${a.profile.firstName} ${a.profile.lastName}`
            : "Patient",
        doctorName: a.doctor ? `Dr. ${a.doctor.lastName}` : undefined
      })),
    [appointments]
  );

  const opsThreads: OpsThread[] = useMemo(
    () =>
      threads.map((t) => ({
        id: t.id,
        status: t.status,
        subject: t.subject,
        assignedDoctorId: t.assignedDoctorId,
        patientName: t.patientProfile
          ? `${t.patientProfile.firstName} ${t.patientProfile.lastName}`
          : undefined
      })),
    [threads]
  );

  const opsOverdue: OpsOverdue[] = useMemo(
    () =>
      overdue.map((o) => ({
        id: o.id,
        firstName: o.firstName,
        lastName: o.lastName,
        daysOverdue: o.daysOverdue
      })),
    [overdue]
  );

  const board = useMemo(
    () =>
      buildFrontDeskBoard({
        todayAppointments: opsAppointments,
        threads: opsThreads,
        overdue: opsOverdue,
        doctors,
        profileGaps: profileGapsFromAppointments(appointments)
      }),
    [opsAppointments, opsThreads, opsOverdue, doctors, appointments]
  );

  const runInline = async (item: DeskItem, action: DeskInlineAction): Promise<void> => {
    if (!item.appointmentId) return;
    setBusyId(item.id);
    try {
      if (action === "check_in") {
        await apiRequest(`/appointments/${item.appointmentId}`, {
          method: "PUT",
          body: { status: "CONFIRMED", checkedInAt: new Date().toISOString() }
        });
        showToast(`Checked in (${measureDeskWorkflowClicks("checkIn")} click)`);
      } else if (action === "confirm") {
        await apiRequest(`/appointments/${item.appointmentId}`, {
          method: "PUT",
          body: { status: "CONFIRMED" }
        });
        showToast(`Visit confirmed (${measureDeskWorkflowClicks("confirmVisit")} click)`);
      } else if (action === "mark_missed") {
        await apiRequest(`/appointments/${item.appointmentId}`, {
          method: "PUT",
          body: { status: "MISSED" }
        });
        showToast(`Marked missed (${measureDeskWorkflowClicks("markMissed")} click)`);
      }
      void apiRequest("/analytics/events", {
        method: "POST",
        body: {
          name:
            action === "check_in"
              ? "reception_check_in"
              : action === "confirm"
                ? "reception_confirm_visit"
                : "reception_mark_missed",
          resourceType: "Appointment",
          resourceId: item.appointmentId,
          metadata: { manual_task_eliminated: true, clicks: measureDeskWorkflowClicks(action === "check_in" ? "checkIn" : action === "confirm" ? "confirmVisit" : "markMissed") }
        }
      }).catch(() => undefined);
      if (action === "check_in" || action === "confirm") {
        void apiRequest("/analytics/events", {
          method: "POST",
          body: {
            name: "manual_task_eliminated",
            resourceType: "Appointment",
            resourceId: item.appointmentId
          }
        }).catch(() => undefined);
      }
      await load();
    } catch (error) {
      showToast(
        error instanceof ApiError
          ? error.message
          : "Update failed — nothing changed. Retry or use Calendar.",
        "error"
      );
    } finally {
      setBusyId(null);
    }
  };

  const visibleLanes = board.lanes.filter((lane) => {
    if (lane.id === "referrals" || lane.id === "providers") return true;
    return lane.items.length > 0;
  });

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST", "NURSE", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Front Desk OS</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            One board for today — every row has a next action. Designed to cut calls, re-keys, conflicts,
            waiting, and no-shows.
          </p>
        </div>
        <p className="text-xs text-slate-600" aria-live="polite">
          Check-in / confirm / mark missed:{" "}
          <span className="font-semibold text-slate-800">{measureDeskWorkflowClicks("checkIn")} click</span>{" "}
          each
        </p>
      </div>

      <NextActionsPanel className="mb-6" title="NEXT_ACTION — front desk" />

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading front desk board</span>
        </div>
      ) : (
        <>
          {loadError ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
              <p className="font-medium">Board refresh failed</p>
              <p className="mt-1">{loadError}</p>
              <button
                type="button"
                className="btn-secondary mt-3 text-sm"
                onClick={() => {
                  setLoading(true);
                  void load()
                    .catch(() => {
                      setLoadError(
                        "Couldn’t refresh the front desk board. Appointments were not changed — retry."
                      );
                    })
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Today active", value: board.summary.todayActive, icon: IconCalendar },
              { label: "Arrivals", value: board.summary.arrivals, icon: IconUsers },
              { label: "Waiting", value: board.summary.waiting, icon: IconUsers },
              { label: "Inbox", value: board.summary.openComms, icon: IconChat }
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {s.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{s.value}</dd>
                </div>
              );
            })}
          </dl>

          <div className="space-y-8">
            {visibleLanes.map((lane) => (
              <section key={lane.id} aria-labelledby={`lane-${lane.id}`}>
                <div className="mb-2">
                  <h2 id={`lane-${lane.id}`} className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    {lane.label}
                    <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                      ({lane.items.length})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">{lane.purpose}</p>
                </div>

                {lane.items.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendar className="h-8 w-8" />}
                    title="Nothing here"
                    description={
                      lane.id === "providers"
                        ? "No providers loaded — calendar still works."
                        : "Clear for this lane."
                    }
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {lane.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.title}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-600">
                            {item.clicks} click path
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                              urgencyClass(item.urgency)
                            )}
                          >
                            {item.urgency}
                          </span>
                          {item.inlineAction ? (
                            <button
                              type="button"
                              className="btn-primary text-sm"
                              disabled={busyId === item.id}
                              aria-busy={busyId === item.id}
                              aria-label={`${item.primaryLabel}: ${item.title}`}
                              onClick={() => void runInline(item, item.inlineAction!)}
                            >
                              {busyId === item.id ? "Working…" : item.primaryLabel}
                            </button>
                          ) : item.href ? (
                            <Link
                              href={item.href}
                              className="btn-secondary text-sm"
                              aria-label={`${item.primaryLabel}: ${item.title}`}
                            >
                              {item.primaryLabel}
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
            <Link href="/patients/new" className="btn-primary text-sm">
              Add patient
            </Link>
            <Link href="/calendar" className="btn-secondary text-sm">
              Full calendar
            </Link>
            <Link href="/messages" className="btn-secondary text-sm">
              All messages
            </Link>
            <Link href="/reminders" className="btn-secondary text-sm">
              Reminders
            </Link>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
