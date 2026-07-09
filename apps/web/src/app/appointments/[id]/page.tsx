"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProtectedPage } from "../../../components/ProtectedPage";
import { StatusBadge, appointmentStatusVariant, reminderStatusVariant } from "../../../components/ui/StatusBadge";
import { Avatar } from "../../../components/ui/Avatar";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconArrowLeft, IconCalendar, IconClock, IconMail, IconPhone, IconBell } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { Appointment, ReminderLog } from "../../../types/api";

export default function AppointmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [aRes, lRes] = await Promise.all([
          apiRequest<{ appointment: Appointment }>(`/appointments/${id}`),
          apiRequest<{ logs: ReminderLog[] }>(`/reminder-logs?appointmentId=${id}`)
        ]);
        setAppointment(aRes.appointment);
        setLogs(lRes.logs);
      } catch { showToast("Failed to load details", "error"); }
      finally { setLoading(false); }
    };
    void load();
  }, [id, showToast]);

  if (loading) {
    return (
      <ProtectedPage>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      </ProtectedPage>
    );
  }

  if (!appointment) {
    return (
      <ProtectedPage>
        <EmptyState title="Appointment not found" description="This appointment may have been deleted." />
      </ProtectedPage>
    );
  }

  const patientName = appointment.patient
    ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
    : appointment.patientId;

  return (
    <ProtectedPage>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link href="/appointments" className="btn-icon">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Appointment Details</h1>
          <p className="mt-0.5 text-sm text-slate-500">Viewing appointment for {patientName}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Appointment info */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <Avatar name={patientName} size="lg" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">{patientName}</h2>
              {appointment.patient ? (
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <IconMail className="h-4 w-4 text-slate-400" />
                    {appointment.patient.email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconPhone className="h-4 w-4 text-slate-400" />
                    {appointment.patient.phone}
                  </span>
                </div>
              ) : null}
            </div>
            <StatusBadge variant={appointmentStatusVariant(appointment.status)} dot>
              {appointment.status.charAt(0) + appointment.status.slice(1).toLowerCase()}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-50 p-2.5">
                <IconCalendar className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="text-sm font-medium text-slate-900">
                  {new Date(appointment.scheduledAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2.5">
                <IconClock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Time</p>
                <p className="text-sm font-medium text-slate-900">
                  {new Date(appointment.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2.5">
                <IconBell className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Reason</p>
                <p className="text-sm font-medium text-slate-900">{appointment.reason || "General visit"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-slate-900">Reminder Summary</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <span className="text-sm text-emerald-700">Sent</span>
              <span className="text-lg font-semibold text-emerald-700">{logs.filter((l) => l.status === "SENT").length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
              <span className="text-sm text-amber-700">Pending</span>
              <span className="text-lg font-semibold text-amber-700">{logs.filter((l) => l.status === "PENDING").length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
              <span className="text-sm text-red-700">Failed</span>
              <span className="text-lg font-semibold text-red-700">{logs.filter((l) => l.status === "FAILED").length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reminder logs table */}
      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">Reminder Logs</h3>
        </div>
        {logs.length === 0 ? (
          <EmptyState
            icon={<IconBell className="h-10 w-10" />}
            title="No reminders sent yet"
            description="Reminders will be logged here once processed."
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Rule</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Channel</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Sent At</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-900">{log.rule?.name ?? "—"}</td>
                  <td className="px-6 py-3.5">
                    <StatusBadge variant={log.channel === "EMAIL" ? "info" : "purple"}>{log.channel}</StatusBadge>
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge variant={reminderStatusVariant(log.status)} dot>
                      {log.status.charAt(0) + log.status.slice(1).toLowerCase()}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-500">
                    {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-red-500">{log.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ProtectedPage>
  );
}
