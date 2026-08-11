"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { DashboardCard } from "../../../components/healthflow/DashboardCard";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { KpiCard } from "../../../components/ui/KpiCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconClipboard, IconPlus, IconSearch } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import type { HealthFlowAppointment, MessageThread } from "../../../types/healthflow";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PatientDashboardPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const { isGuestSession } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setAppointments([]);
          setThreads([]);
          return;
        }
        const now = new Date().toISOString();
        const [apptRes, threadRes] = await Promise.all([
          apiRequest<{ appointments: HealthFlowAppointment[] }>(`/appointments?from=${encodeURIComponent(now)}`).catch(() => ({
            appointments: [] as HealthFlowAppointment[]
          })),
          apiRequest<{ threads: MessageThread[] }>("/messages/threads").catch(() => ({
            threads: [] as MessageThread[]
          }))
        ]);
        setAppointments(apptRes.appointments.slice(0, 5));
        setThreads(threadRes.threads.slice(0, 3));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const unreadMessages = threads.filter((t) => t.status === "UNREAD" || t.status === "PENDING").length;

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Patient Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Your care at a glance</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-3">
            <KpiCard title="Upcoming Appointments" value={appointments.length} icon={<IconCalendar className="h-6 w-6" />} iconBg="bg-teal-50 text-teal-600" />
            <KpiCard title="Active Messages" value={threads.length} icon={<IconChat className="h-6 w-6" />} iconBg="bg-brand-50 text-brand-600" />
            <KpiCard title="Needs Attention" value={unreadMessages} icon={<IconChat className="h-6 w-6" />} iconBg="bg-amber-50 text-amber-600" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <DashboardCard title="Upcoming Appointments" href="/calendar">
              {appointments.length === 0 ? (
                <EmptyState icon={<IconCalendar className="h-10 w-10" />} title="No upcoming appointments" description="Schedule your next visit from the calendar." />
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

            <DashboardCard title="Recent Messages" href="/messages">
              {threads.length === 0 ? (
                <EmptyState icon={<IconChat className="h-10 w-10" />} title="No messages yet" description="Start a conversation with your care team." />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {threads.map((thread) => (
                    <div key={thread.id} className="px-6 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{thread.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{thread.status.toLowerCase()} · {thread.priority.toLowerCase()}</p>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <IconClipboard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Care Guide</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Not sure whether to message, book, or seek urgent care? Get next-step guidance, visit prep, and clinic answers.
                  </p>
                  <Link href="/patient/care-guide" className="btn-primary mt-4 inline-flex">
                    Open Care Guide
                  </Link>
                </div>
              </div>
            </div>
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link href="/patient/care-guide?tab=prep" className="btn-secondary">
                  <IconClipboard className="h-4 w-4" />
                  Visit prep
                </Link>
                <Link href="/messages" className="btn-secondary">
                  <IconPlus className="h-4 w-4" />
                  New Message
                </Link>
                <Link href="/calendar" className="btn-secondary">
                  <IconCalendar className="h-4 w-4" />
                  View Calendar
                </Link>
                <Link href="/resources" className="btn-secondary">
                  <IconSearch className="h-4 w-4" />
                  Find Resources
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
