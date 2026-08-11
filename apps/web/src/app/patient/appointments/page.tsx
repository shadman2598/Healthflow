"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowAppointment } from "../../../types/healthflow";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function PatientAppointmentsPage() {
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    const res = await apiRequest<{ appointments: HealthFlowAppointment[] }>("/appointments");
    setAppointments(
      res.appointments.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    );
  };

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const { isGuestSession } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setAppointments([]);
          return;
        }
        await load();
      } catch {
        showToast("Failed to load appointments", "error");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [showToast]);

  const upcoming = useMemo(
    () =>
      appointments.filter(
        (a) => new Date(a.scheduledAt) >= new Date() && !["COMPLETED", "CANCELLED", "MISSED"].includes(a.status)
      ),
    [appointments]
  );
  const history = useMemo(
    () =>
      appointments.filter(
        (a) => new Date(a.scheduledAt) < new Date() || ["COMPLETED", "CANCELLED", "MISSED"].includes(a.status)
      ),
    [appointments]
  );

  const updateStatus = async (id: string, status: string): Promise<void> => {
    try {
      await apiRequest(`/appointments/${id}`, { method: "PUT", body: { status } });
      showToast("Appointment updated");
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Update failed", "error");
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Appointment History</h1>
        <p className="mt-1 text-sm text-slate-500">Upcoming visits and past appointments</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Upcoming</h2>
            {upcoming.length === 0 ? (
              <EmptyState icon={<IconCalendar className="h-10 w-10" />} title="No upcoming appointments" />
            ) : (
              <div className="space-y-3">
                {upcoming.map((appt) => (
                  <div key={appt.id} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatDateTime(appt.scheduledAt)}</p>
                        <p className="text-xs text-slate-500">{appt.reason ?? appt.category.replace("_", " ")}</p>
                        {appt.doctor ? (
                          <p className="mt-1 text-xs text-slate-500">Dr. {appt.doctor.firstName} {appt.doctor.lastName}</p>
                        ) : null}
                        {appt.patientNotes ? <p className="mt-2 text-xs text-slate-600">{appt.patientNotes}</p> : null}
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {appt.status === "SCHEDULED" ? (
                        <button type="button" className="btn-primary text-xs" onClick={() => updateStatus(appt.id, "CONFIRMED")}>
                          Confirm
                        </button>
                      ) : null}
                      <button type="button" className="btn-secondary text-xs" onClick={() => updateStatus(appt.id, "RESCHEDULE_REQUESTED")}>
                        Request reschedule
                      </button>
                      <button type="button" className="btn-danger text-xs" onClick={() => updateStatus(appt.id, "CANCELLED")}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">History</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No past appointments.</p>
            ) : (
              <div className="card divide-y divide-slate-100">
                {history.map((appt) => (
                  <div key={appt.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{formatDateTime(appt.scheduledAt)}</p>
                      <p className="text-xs text-slate-500">{appt.reason ?? appt.category.replace("_", " ")}</p>
                    </div>
                    <AppointmentStatusBadge status={appt.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </ProtectedRolePage>
  );
}
