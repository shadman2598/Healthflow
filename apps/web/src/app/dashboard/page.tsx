"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "../../components/ProtectedPage";
import { KpiCard } from "../../components/ui/KpiCard";
import { StatusBadge, appointmentStatusVariant, reminderStatusVariant } from "../../components/ui/StatusBadge";
import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconCalendar, IconClock, IconAlertTriangle, IconBell, IconActivity, IconCheckCircle, IconChevronRight } from "../../components/ui/Icons";
import { apiRequest } from "../../lib/api";
import type { Appointment, ReminderLog } from "../../types/api";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

        const [upcomingRes, todayRes, logsRes] = await Promise.all([
          apiRequest<{ appointments: Appointment[] }>(`/appointments?from=${encodeURIComponent(now.toISOString())}`),
          apiRequest<{ appointments: Appointment[] }>(`/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`),
          apiRequest<{ logs: ReminderLog[] }>("/reminder-logs")
        ]);
        setAppointments(upcomingRes.appointments);
        setAllAppointments(todayRes.appointments);
        setLogs(logsRes.logs);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const todayAppts = allAppointments.length;
    const pending = allAppointments.filter((a) => a.status === "SCHEDULED").length;
    const missed = allAppointments.filter(
      (a) => a.status === "SCHEDULED" && new Date(a.scheduledAt) < now
    ).length;
    const alertCount = logs.filter((l) => l.status === "FAILED").length +
      logs.filter((l) => l.status === "PENDING" && new Date(l.createdAt) < new Date(now.getTime() - 30 * 60000)).length;

    return { todayAppts, pending, missed, alertCount };
  }, [allAppointments, logs]);

  const recentLogs = useMemo(() =>
    [...logs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8),
    [logs]
  );

  const upcomingTimeline = useMemo(() =>
    appointments.slice(0, 6),
    [appointments]
  );

  if (loading) {
    return (
      <ProtectedPage>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview for {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Appointments Today"
          value={stats.todayAppts}
          icon={<IconCalendar className="h-6 w-6" />}
          iconBg="bg-brand-50 text-brand-600"
        />
        <KpiCard
          title="Pending Confirmations"
          value={stats.pending}
          icon={<IconClock className="h-6 w-6" />}
          iconBg="bg-amber-50 text-amber-600"
        />
        <KpiCard
          title="Missed Appointments"
          value={stats.missed}
          icon={<IconAlertTriangle className="h-6 w-6" />}
          iconBg="bg-red-50 text-red-500"
        />
        <KpiCard
          title="Alerts"
          value={stats.alertCount}
          icon={<IconBell className="h-6 w-6" />}
          iconBg="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Main content grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Appointment table — 2 cols */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Today&apos;s Appointments</h2>
            <Link href="/appointments" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {allAppointments.length === 0 ? (
            <EmptyState
              icon={<IconCalendar className="h-10 w-10" />}
              title="No appointments today"
              description="Appointments for today will appear here."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {allAppointments.slice(0, 8).map((appt) => (
                <Link
                  key={appt.id}
                  href={`/appointments/${appt.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <Avatar
                    name={appt.patient ? `${appt.patient.firstName} ${appt.patient.lastName}` : "?"}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {appt.patient ? `${appt.patient.firstName} ${appt.patient.lastName}` : appt.patientId}
                    </p>
                    <p className="text-xs text-slate-500">{appt.reason ?? "General visit"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{formatTime(appt.scheduledAt)}</p>
                    <StatusBadge variant={appointmentStatusVariant(appt.status)} dot>
                      {appt.status.charAt(0) + appt.status.slice(1).toLowerCase()}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column — timeline + alerts */}
        <div className="space-y-6">
          {/* Upcoming schedule timeline */}
          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Upcoming Schedule</h2>
            </div>
            {upcomingTimeline.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">No upcoming appointments</div>
            ) : (
              <div className="px-5 py-3">
                {upcomingTimeline.map((appt, i) => (
                  <div key={appt.id} className="flex gap-3 py-2.5">
                    <div className="flex flex-col items-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                      {i < upcomingTimeline.length - 1 ? (
                        <div className="w-px flex-1 bg-slate-200" />
                      ) : null}
                    </div>
                    <div className="pb-3">
                      <p className="text-sm font-medium text-slate-900">
                        {appt.patient ? `${appt.patient.firstName} ${appt.patient.lastName}` : "Patient"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(appt.scheduledAt)} at {formatTime(appt.scheduledAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Patient alerts */}
          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Patient Alerts</h2>
            </div>
            {stats.alertCount === 0 ? (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-slate-400">
                <IconCheckCircle className="h-5 w-5 text-emerald-400" />
                All clear — no alerts
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {logs.filter((l) => l.status === "FAILED").slice(0, 4).map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 rounded-full bg-red-50 p-1.5">
                      <IconAlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Reminder failed for {log.patient ? `${log.patient.firstName} ${log.patient.lastName}` : "patient"}
                      </p>
                      <p className="text-xs text-slate-500">{log.error ?? "Unknown error"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="mt-6">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Activity Feed</h2>
            <span className="text-xs text-slate-400">Recent reminder activity</span>
          </div>
          {recentLogs.length === 0 ? (
            <EmptyState
              icon={<IconActivity className="h-10 w-10" />}
              title="No activity yet"
              description="Reminder activity will appear here once reminders are processed."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-4 px-6 py-3">
                  <div className={`rounded-full p-2 ${
                    log.status === "SENT" ? "bg-emerald-50" :
                    log.status === "FAILED" ? "bg-red-50" : "bg-amber-50"
                  }`}>
                    {log.status === "SENT" ? <IconCheckCircle className="h-4 w-4 text-emerald-500" /> :
                     log.status === "FAILED" ? <IconAlertTriangle className="h-4 w-4 text-red-500" /> :
                     <IconClock className="h-4 w-4 text-amber-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{log.channel}</span> reminder{" "}
                      <StatusBadge variant={reminderStatusVariant(log.status)}>
                        {log.status.toLowerCase()}
                      </StatusBadge>
                      {log.patient ? (
                        <> for <span className="font-medium">{log.patient.firstName} {log.patient.lastName}</span></>
                      ) : null}
                    </p>
                    {log.rule ? <p className="text-xs text-slate-400">Rule: {log.rule.name}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{relativeTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedPage>
  );
}
