"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "../../components/ProtectedPage";
import { Modal } from "../../components/Modal";
import { StatusBadge, appointmentStatusVariant } from "../../components/ui/StatusBadge";
import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconPlus, IconCalendar, IconFilter, IconEye, IconEdit, IconTrash } from "../../components/ui/Icons";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";
import type { Appointment, AppointmentStatus, Patient } from "../../types/api";

type AppointmentForm = { patientId: string; scheduledAt: string; reason: string; status: AppointmentStatus };
const initialForm: AppointmentForm = { patientId: "", scheduledAt: "", reason: "", status: "SCHEDULED" };

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AppointmentsPage() {
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentForm>(initialForm);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  const loadPatients = async (): Promise<void> => {
    const res = await apiRequest<{ patients: Patient[] }>("/patients");
    setPatients(res.patients);
    if (!form.patientId && res.patients[0]) setForm((p) => ({ ...p, patientId: res.patients[0].id }));
  };

  const loadAppointments = async (): Promise<void> => {
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    const path = params.toString() ? `/appointments?${params}` : "/appointments";
    const res = await apiRequest<{ appointments: Appointment[] }>(path);
    setAppointments(res.appointments);
  };

  useEffect(() => {
    Promise.all([loadPatients(), loadAppointments()])
      .catch(() => showToast("Failed to load data", "error"))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = (): void => { setEditing(null); setForm((p) => ({ ...initialForm, patientId: p.patientId })); setModalOpen(true); };
  const openEdit = (a: Appointment): void => {
    setEditing(a);
    setForm({ patientId: a.patientId, scheduledAt: toLocalDatetimeValue(a.scheduledAt), reason: a.reason ?? "", status: a.status });
    setModalOpen(true);
  };

  const onDelete = async (id: string): Promise<void> => {
    if (!window.confirm("Delete this appointment?")) return;
    try {
      await apiRequest(`/appointments/${id}`, { method: "DELETE" });
      showToast("Appointment deleted");
      await loadAppointments();
    } catch { showToast("Delete failed", "error"); }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const payload = {
      patientId: form.patientId,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      reason: form.reason || undefined,
      status: form.status
    };
    try {
      if (editing) {
        await apiRequest(`/appointments/${editing.id}`, { method: "PUT", body: payload });
        showToast("Appointment updated");
      } else {
        await apiRequest("/appointments", { method: "POST", body: payload });
        showToast("Appointment created");
      }
      setModalOpen(false);
      await loadAppointments();
    } catch (err) { showToast(err instanceof ApiError ? err.message : "Save failed", "error"); }
  };

  const statusCounts = useMemo(() => {
    const counts = { total: appointments.length, SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0 };
    appointments.forEach((a) => { counts[a.status]++; });
    return counts;
  }, [appointments]);

  return (
    <ProtectedPage>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">{statusCounts.total} total &middot; {statusCounts.SCHEDULED} scheduled &middot; {statusCounts.COMPLETED} completed</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowFilter(!showFilter)}>
            <IconFilter className="h-4 w-4" />
            Filter
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <IconPlus className="h-4 w-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilter ? (
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label">From</label>
              <input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={() => void loadAppointments().catch(() => showToast("Filter failed", "error"))}>
              Apply
            </button>
            <button
              className="btn-ghost"
              onClick={() => { setFrom(""); setTo(""); void loadAppointments(); }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<IconCalendar className="h-10 w-10" />}
            title="No appointments found"
            description="Create your first appointment or adjust the filters."
            action={<button className="btn-primary" onClick={openCreate}><IconPlus className="h-4 w-4" />New Appointment</button>}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "?"} size="sm" />
                      <p className="text-sm font-medium text-slate-900">
                        {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : a.patientId}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-900">{new Date(a.scheduledAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</p>
                    <p className="text-xs text-slate-500">{new Date(a.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge variant={appointmentStatusVariant(a.status)} dot>
                      {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{a.reason || "—"}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      <Link href={`/appointments/${a.id}`} className="btn-icon" title="View">
                        <IconEye className="h-4 w-4" />
                      </Link>
                      <button className="btn-icon" onClick={() => openEdit(a)} title="Edit">
                        <IconEdit className="h-4 w-4" />
                      </button>
                      <button className="btn-icon hover:!bg-red-50 hover:!text-red-600" onClick={() => void onDelete(a.id)} title="Delete">
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen ? (
        <Modal
          title={editing ? "Edit Appointment" : "New Appointment"}
          description={editing ? "Update appointment details." : "Schedule a new appointment."}
          onClose={() => setModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label">Patient</label>
              <select className="w-full" value={form.patientId} onChange={(e) => setForm((p) => ({ ...p, patientId: e.target.value }))} required>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date & Time</label>
              <input type="datetime-local" className="w-full" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="w-full" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as AppointmentStatus }))}>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Reason (optional)</label>
              <textarea className="w-full" rows={3} value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Annual checkup, follow-up, etc." />
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary">{editing ? "Save Changes" : "Create Appointment"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </ProtectedPage>
  );
}
