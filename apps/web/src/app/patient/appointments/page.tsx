"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { TrustBanner } from "../../../components/healthflow/TrustBanner";
import { WhatsNextCard } from "../../../components/healthflow/WhatsNextCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { findClinicFee } from "../../../lib/clinic-fees";
import { resolvePatientNextStep, VISIT_REQUEST_DRAFT_PATH } from "../../../lib/patient-journey";
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
  const [isGuest, setIsGuest] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
          setIsGuest(true);
          setAppointments([]);
          return;
        }
        await load();
        setLoadError(null);
      } catch {
        setLoadError("We couldn’t load your appointments. Your bookings were not changed. Retry or contact reception.");
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

  const journeyStep = useMemo(
    () => resolvePatientNextStep({ isGuest, appointments, threads: [] }),
    [isGuest, appointments]
  );

  const lateCancelFee = findClinicFee("late-cancel");

  const hoursUntil = (iso: string): number =>
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);

  const updateStatus = async (id: string, status: string, scheduledAt?: string): Promise<void> => {
    if (status === "CANCELLED" && scheduledAt) {
      const hours = hoursUntil(scheduledAt);
      const feeNote =
        hours < 24 && lateCancelFee
          ? `\n\nThis is under 24 hours — a late cancellation fee of ${lateCancelFee.cost} may apply.`
          : lateCancelFee
            ? `\n\nCancel at least 24 hours ahead when possible to avoid the ${lateCancelFee.cost} late-cancel fee.`
            : "";
      if (!window.confirm(`Cancel this appointment?${feeNote}`)) return;
    }
    try {
      await apiRequest(`/appointments/${id}`, { method: "PUT", body: { status } });
      showToast("Appointment updated");
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Update failed — no change was saved", "error");
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Appointment History</h1>
        <p className="mt-1 text-sm text-slate-500">Upcoming visits and past appointments</p>
      </div>

      <TrustBanner context="booking" className="mb-6" />
      <WhatsNextCard step={journeyStep} className="mb-6" compact />

      {loadError ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          <p className="font-medium">Couldn’t refresh appointments</p>
          <p className="mt-1">{loadError}</p>
          <button
            type="button"
            className="btn-secondary mt-3 text-xs"
            onClick={() => {
              setLoading(true);
              void load()
                .then(() => setLoadError(null))
                .catch(() => undefined)
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-48 items-center justify-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="sr-only">Loading appointments</span>
        </div>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<IconCalendar className="h-10 w-10" />}
                title="No upcoming appointments"
                description="Message the clinic to request a visit when you are ready."
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((appt) => (
                  <div key={appt.id} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatDateTime(appt.scheduledAt)}</p>
                        <p className="text-xs text-slate-500">{appt.reason ?? appt.category.replace("_", " ")}</p>
                        {appt.doctor ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Dr. {appt.doctor.firstName} {appt.doctor.lastName}
                          </p>
                        ) : null}
                        {appt.patientNotes ? <p className="mt-2 text-xs text-slate-600">{appt.patientNotes}</p> : null}
                      </div>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {appt.status === "SCHEDULED" ? (
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          onClick={() => void updateStatus(appt.id, "CONFIRMED")}
                        >
                          Confirm
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => void updateStatus(appt.id, "RESCHEDULE_REQUESTED")}
                      >
                        Request reschedule
                      </button>
                      <button
                        type="button"
                        className="btn-danger text-xs"
                        onClick={() => void updateStatus(appt.id, "CANCELLED", appt.scheduledAt)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {upcoming.length === 0 && !isGuest ? (
              <div className="mt-4">
                <Link href={VISIT_REQUEST_DRAFT_PATH} className="btn-primary text-sm">
                  Request a visit
                </Link>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              History
            </h2>
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
