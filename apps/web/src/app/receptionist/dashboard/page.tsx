"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildReceptionActions,
  buildReceptionQueue,
  type OpsAppointment,
  type OpsOverdue,
  type OpsThread
} from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { KpiCard } from "../../../components/ui/KpiCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconAlertTriangle, IconCalendar, IconChat, IconUsers } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowAppointment, MessageThread, OverdueCheckup } from "../../../types/healthflow";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ReceptionistDashboardPage() {
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [overdue, setOverdue] = useState<OverdueCheckup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const [todayRes, threadRes, overdueRes] = await Promise.all([
      apiRequest<{ appointments: HealthFlowAppointment[] }>(
        `/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`
      ),
      apiRequest<{ threads: MessageThread[] }>("/messages/threads"),
      apiRequest<{ overdue: OverdueCheckup[] }>("/patient-profiles/overdue/checkups")
    ]);
    setAppointments(todayRes.appointments);
    setThreads(threadRes.threads);
    setOverdue(overdueRes.overdue);
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

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

  const actions = useMemo(
    () => buildReceptionActions({ todayAppointments: opsAppointments, threads: opsThreads, overdue: opsOverdue }),
    [opsAppointments, opsThreads, opsOverdue]
  );
  const queue = useMemo(() => buildReceptionQueue(opsAppointments), [opsAppointments]);
  const pendingThreads = useMemo(
    () => threads.filter((t) => t.status === "PENDING" || t.status === "UNREAD").length,
    [threads]
  );

  const checkIn = async (appointmentId: string): Promise<void> => {
    try {
      await apiRequest(`/appointments/${appointmentId}`, {
        method: "PUT",
        body: { status: "CONFIRMED", checkedInAt: new Date().toISOString() }
      });
      showToast("Patient checked in");
      void apiRequest("/analytics/events", {
        method: "POST",
        body: { name: "appointment_confirmed", resourceType: "Appointment", resourceId: appointmentId }
      }).catch(() => undefined);
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Check-in failed", "error");
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Front Desk OS</h1>
        <p className="mt-1 text-sm text-slate-500">
          Today&apos;s queue with one next action per item — fewer calls, fewer re-keys.
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading front desk board</span>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Today's visits" value={appointments.length} icon={<IconCalendar className="h-6 w-6" />} />
            <KpiCard
              title="Needs reply"
              value={pendingThreads}
              icon={<IconChat className="h-6 w-6" />}
              iconBg="bg-amber-50 text-amber-600"
            />
            <KpiCard
              title="Overdue checkups"
              value={overdue.length}
              icon={<IconAlertTriangle className="h-6 w-6" />}
              iconBg="bg-red-50 text-red-500"
            />
            <KpiCard
              title="Open actions"
              value={actions.filter((a) => a.id !== "clear").length}
              icon={<IconUsers className="h-6 w-6" />}
              iconBg="bg-teal-50 text-teal-600"
            />
          </div>

          <section className="mt-8" aria-labelledby="next-actions-heading">
            <h2 id="next-actions-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Next actions
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {actions.map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className="card flex items-start justify-between gap-3 p-4 transition hover:border-brand-300"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{action.reason}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                    {action.urgency}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="queue-heading">
            <h2 id="queue-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Today&apos;s patient queue
            </h2>
            {queue.length === 0 ? (
              <EmptyState icon={<IconCalendar className="h-10 w-10" />} title="No appointments today" />
            ) : (
              <div className="card divide-y divide-slate-100">
                {queue.map((item) => (
                  <div key={item.appointmentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatTime(item.time)} · {item.patientName}
                      </p>
                      <p className="text-xs text-slate-500">{item.reason}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AppointmentStatusBadge status={item.status as HealthFlowAppointment["status"]} />
                      {item.status === "SCHEDULED" || item.status === "CONFIRMED" ? (
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          onClick={() => void checkIn(item.appointmentId)}
                        >
                          Check in
                        </button>
                      ) : null}
                      <Link href={item.nextActionHref} className="btn-secondary text-xs">
                        {item.nextActionLabel}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/patients" className="btn-primary">
              Patients
            </Link>
            <Link href="/messages" className="btn-secondary">
              Messages
            </Link>
            <Link href="/calendar" className="btn-secondary">
              Calendar
            </Link>
            <Link href="/overdue-checkups" className="btn-secondary">
              Overdue checkups
            </Link>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
