"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildClinicianActions } from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { DashboardCard } from "../../../components/healthflow/DashboardCard";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { KpiCard } from "../../../components/ui/KpiCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconClock } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import type { HealthFlowAppointment, HealthFlowUser, MessageThread } from "../../../types/healthflow";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DoctorDashboardPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const { isGuestSession } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setDoctorProfileId("guest-doctor");
          setAppointments([]);
          setThreads([]);
          return;
        }
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
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const assignedThreads = useMemo(() => threads.filter((t) => t.assignedDoctorId !== null).length, [threads]);
  const unassignedThreads = useMemo(() => threads.filter((t) => !t.assignedDoctorId).length, [threads]);
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

  return (
    <ProtectedRolePage allowedRoles={["DOCTOR"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Clinician home</h1>
        <p className="mt-1 text-sm text-slate-500">Minutes saved start with a clear next patient.</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {actions.slice(0, 2).map((action) => (
              <Link key={action.id} href={action.href} className="card p-4 hover:border-brand-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{action.urgency}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{action.title}</p>
                <p className="mt-1 text-xs text-slate-500">{action.reason}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <KpiCard
              title="Today's Appointments"
              value={appointments.length}
              icon={<IconCalendar className="h-6 w-6" />}
              iconBg="bg-teal-50 text-teal-600"
            />
            <KpiCard title="Assigned Messages" value={assignedThreads} icon={<IconChat className="h-6 w-6" />} />
            <KpiCard
              title="Unassigned Messages"
              value={unassignedThreads}
              icon={<IconClock className="h-6 w-6" />}
              iconBg="bg-amber-50 text-amber-600"
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <DashboardCard title="Today's Schedule" href="/doctor/cockpit">
              {appointments.length === 0 ? (
                <EmptyState icon={<IconCalendar className="h-10 w-10" />} title="No appointments today" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {appointments.map((appt) => (
                    <Link
                      key={appt.id}
                      href={`/doctor/cockpit?appointmentId=${appt.id}`}
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {appt.patient
                            ? `${appt.patient.firstName} ${appt.patient.lastName}`
                            : appt.profile
                              ? `${appt.profile.firstName} ${appt.profile.lastName}`
                              : "Patient"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTime(appt.scheduledAt)} · {appt.category.replace("_", " ")}
                        </p>
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </Link>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Patient Messages" href="/messages">
              {threads.length === 0 ? (
                <EmptyState icon={<IconChat className="h-10 w-10" />} title="No message threads" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {threads.slice(0, 6).map((thread) => (
                    <div key={thread.id} className="px-6 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{thread.subject}</p>
                      <p className="text-xs text-slate-500">
                        {thread.patientProfile
                          ? `${thread.patientProfile.firstName} ${thread.patientProfile.lastName}`
                          : "Patient"}{" "}
                        · {thread.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/doctor/cockpit" className="btn-primary">
              Open cockpit
            </Link>
            <Link href="/calendar" className="btn-secondary">
              Calendar
            </Link>
            <Link href="/messages" className="btn-secondary">
              Messages
            </Link>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
