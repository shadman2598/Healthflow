"use client";

import { useMemo, useState } from "react";
import { APPOINTMENT_CATEGORY_COLORS } from "../../lib/role-config";
import { cn } from "../../lib/utils";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import type { HealthFlowAppointment } from "../../types/healthflow";

export type CalendarView = "month" | "week" | "day" | "list";

type AppointmentCalendarProps = {
  appointments: HealthFlowAppointment[];
  loading?: boolean;
  doctors?: { id: string; label: string }[];
  patients?: { id: string; label: string }[];
  doctorId?: string;
  profileId?: string;
  dateFrom?: string;
  dateTo?: string;
  onDoctorChange?: (value: string) => void;
  onProfileChange?: (value: string) => void;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
};

const CATEGORY_DOT: Record<string, string> = {
  CHECKUP: "bg-blue-500",
  FOLLOW_UP: "bg-teal-500",
  MEDICATION: "bg-purple-500",
  LAB_REVIEW: "bg-orange-500",
  URGENT: "bg-red-500",
  CONSULTATION: "bg-green-500",
  OTHER: "bg-slate-400"
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AppointmentCalendar({
  appointments,
  loading,
  doctors = [],
  patients = [],
  doctorId = "",
  profileId = "",
  dateFrom = "",
  dateTo = "",
  onDoctorChange,
  onProfileChange,
  onDateFromChange,
  onDateToChange
}: AppointmentCalendarProps) {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (categoryFilter && a.category !== categoryFilter) return false;
      return true;
    });
  }, [appointments, statusFilter, categoryFilter]);

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const apptsForDay = (day: Date): HealthFlowAppointment[] =>
    filtered.filter((a) => sameDay(new Date(a.scheduledAt), day));

  if (loading) {
    return (
      <div className="card flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["month", "week", "day", "list"] as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium capitalize", view === v ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>Prev</button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-slate-900">
            {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Next</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="RESCHEDULE_REQUESTED">Reschedule requested</option>
        </select>
        <select className="w-44" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {Object.keys(APPOINTMENT_CATEGORY_COLORS).map((cat) => (
            <option key={cat} value={cat}>{cat.replace("_", " ")}</option>
          ))}
        </select>
        {doctors.length > 0 ? (
          <select className="w-40" value={doctorId} onChange={(e) => onDoctorChange?.(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        ) : null}
        {patients.length > 0 ? (
          <select className="w-44" value={profileId} onChange={(e) => onProfileChange?.(e.target.value)}>
            <option value="">All patients</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        ) : null}
        <input type="date" className="w-40" value={dateFrom} onChange={(e) => onDateFromChange?.(e.target.value)} />
        <input type="date" className="w-40" value={dateTo} onChange={(e) => onDateToChange?.(e.target.value)} />
      </div>

      {view === "month" ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium uppercase text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayAppts = apptsForDay(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              return (
                <div key={day.toISOString()} className={cn("min-h-24 border-b border-r border-slate-50 p-1.5", !inMonth && "bg-slate-50/50")}>
                  <p className={cn("text-xs font-medium", inMonth ? "text-slate-700" : "text-slate-400")}>{day.getDate()}</p>
                  <div className="mt-1 space-y-1">
                    {dayAppts.slice(0, 3).map((a) => (
                      <div key={a.id} className="flex items-center gap-1 truncate rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-700">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", CATEGORY_DOT[a.category] ?? CATEGORY_DOT.OTHER)} />
                        {formatTime(a.scheduledAt)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="card grid grid-cols-7 divide-x divide-slate-100">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="p-3">
              <p className="text-xs font-semibold text-slate-500">{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</p>
              <div className="mt-2 space-y-2">
                {apptsForDay(day).map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-100 p-2 text-xs">
                    <p className="font-medium text-slate-900">{formatTime(a.scheduledAt)}</p>
                    <p className="text-slate-500 truncate">{a.reason ?? a.category}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-900">{cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <div className="mt-4 space-y-3">
            {apptsForDay(cursor).length === 0 ? (
              <p className="text-sm text-slate-500">No appointments this day.</p>
            ) : (
              apptsForDay(cursor).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium">{formatTime(a.scheduledAt)} — {a.reason ?? a.category.replace("_", " ")}</p>
                    {a.patient ? <p className="text-xs text-slate-500">{a.patient.firstName} {a.patient.lastName}</p> : null}
                  </div>
                  <AppointmentStatusBadge status={a.status} />
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="card divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No appointments match filters.</p>
          ) : (
            filtered.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{new Date(a.scheduledAt).toLocaleString()}</p>
                  <p className="text-xs text-slate-500">
                    {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "Appointment"}
                    {a.doctor ? ` · Dr. ${a.doctor.lastName}` : ""}
                  </p>
                </div>
                <AppointmentStatusBadge status={a.status} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
