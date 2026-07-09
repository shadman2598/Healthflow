"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconBell } from "../../components/ui/Icons";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowAppointment } from "../../types/healthflow";

type Reminder = {
  id: string;
  offsetMinutes: number;
  channel: string;
  status: string;
  dailyUntilAppt: boolean;
  appointment?: HealthFlowAppointment;
  profile?: { firstName: string; lastName: string };
};

const OFFSET_OPTIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "3 days", minutes: 4320 },
  { label: "1 week", minutes: 10080 }
];

export default function RemindersPage() {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    appointmentId: "",
    offsetMinutes: 1440,
    channel: "EMAIL" as "EMAIL" | "SMS" | "IN_APP",
    dailyUntilAppt: false
  });

  const load = async (): Promise<void> => {
    const [remRes, apptRes] = await Promise.all([
      apiRequest<{ reminders: Reminder[] }>("/reminders"),
      apiRequest<{ appointments: HealthFlowAppointment[] }>(
        `/appointments?from=${encodeURIComponent(new Date().toISOString())}`
      )
    ]);
    setReminders(remRes.reminders);
    setAppointments(apptRes.appointments);
    if (!form.appointmentId && apptRes.appointments[0]) {
      setForm((f) => ({ ...f, appointmentId: apptRes.appointments[0].id }));
    }
  };

  useEffect(() => {
    load()
      .catch(() => showToast("Failed to load reminders", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const onCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setCreating(true);
    try {
      await apiRequest("/reminders", { method: "POST", body: form });
      showToast("Reminder scheduled");
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create reminder", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Reminders</h1>
        <p className="mt-1 text-sm text-slate-500">Schedule appointment reminders for patients</p>
      </div>

      <form className="card mb-8 space-y-4 p-6" onSubmit={onCreate}>
        <h2 className="text-sm font-semibold text-slate-900">Create reminder</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Appointment</label>
            <select required className="w-full" value={form.appointmentId} onChange={(e) => setForm({ ...form, appointmentId: e.target.value })}>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.scheduledAt).toLocaleString()} — {a.patient?.firstName} {a.patient?.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Send before appointment</label>
            <select className="w-full" value={form.offsetMinutes} onChange={(e) => setForm({ ...form, offsetMinutes: Number(e.target.value) })}>
              {OFFSET_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Channel</label>
            <select className="w-full" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as "EMAIL" | "SMS" | "IN_APP" })}>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS (placeholder)</option>
              <option value="IN_APP">In-app (placeholder)</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={form.dailyUntilAppt} onChange={(e) => setForm({ ...form, dailyUntilAppt: e.target.checked })} />
            Daily reminder until appointment
          </label>
        </div>
        <button type="submit" disabled={creating} className="btn-primary">{creating ? "Scheduling..." : "Schedule reminder"}</button>
      </form>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : reminders.length === 0 ? (
        <EmptyState icon={<IconBell className="h-10 w-10" />} title="No reminders" description="Create a reminder for an upcoming appointment." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {reminders.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {r.profile ? `${r.profile.firstName} ${r.profile.lastName}` : "Patient"}
                </p>
                <p className="text-xs text-slate-500">
                  {r.appointment ? new Date(r.appointment.scheduledAt).toLocaleString() : "Appointment"} · {r.channel} · {r.offsetMinutes}m before
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{r.status.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}
    </ProtectedRolePage>
  );
}
