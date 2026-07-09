"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { DashboardCard } from "../../../components/healthflow/DashboardCard";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { KpiCard } from "../../../components/ui/KpiCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconAlertTriangle, IconCalendar, IconChat, IconUsers } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import type { HealthFlowAppointment, MessageThread, OverdueCheckup } from "../../../types/healthflow";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ReceptionistDashboardPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [overdue, setOverdue] = useState<OverdueCheckup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
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
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const pendingThreads = useMemo(() => threads.filter((t) => t.status === "PENDING" || t.status === "UNREAD").length, [threads]);

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Receptionist Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Today&apos;s clinic operations</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Today's Appointments" value={appointments.length} icon={<IconCalendar className="h-6 w-6" />} />
            <KpiCard title="Pending Messages" value={pendingThreads} icon={<IconChat className="h-6 w-6" />} iconBg="bg-amber-50 text-amber-600" />
            <KpiCard title="Overdue Checkups" value={overdue.length} icon={<IconAlertTriangle className="h-6 w-6" />} iconBg="bg-red-50 text-red-500" />
            <KpiCard title="Active Threads" value={threads.length} icon={<IconUsers className="h-6 w-6" />} iconBg="bg-teal-50 text-teal-600" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <DashboardCard title="Today's Schedule" href="/calendar">
              {appointments.length === 0 ? (
                <EmptyState icon={<IconCalendar className="h-10 w-10" />} title="No appointments today" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {appointments.slice(0, 8).map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between px-6 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {appt.patient ? `${appt.patient.firstName} ${appt.patient.lastName}` : "Patient"}
                        </p>
                        <p className="text-xs text-slate-500">{formatTime(appt.scheduledAt)} · {appt.reason ?? appt.category}</p>
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Overdue Checkups" href="/overdue-checkups">
              {overdue.length === 0 ? (
                <EmptyState icon={<IconAlertTriangle className="h-10 w-10" />} title="All patients up to date" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {overdue.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-6 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{p.firstName} {p.lastName}</p>
                      <span className="text-xs font-medium text-red-600">{p.daysOverdue} days overdue</span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/calendar" className="btn-primary">View Calendar</Link>
            <Link href="/messages" className="btn-secondary">Messages</Link>
            <Link href="/overdue-checkups" className="btn-secondary">Overdue Checkups</Link>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
