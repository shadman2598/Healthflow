"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { apiRequest } from "../../../lib/api";
import { isGuestSession } from "../../../lib/guest-session";
import type { HealthFlowAppointment } from "../../../types/healthflow";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function PatientVisitsPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (isGuestSession()) {
        setAppointments([]);
        return;
      }
      const res = await apiRequest<{ appointments: HealthFlowAppointment[] }>("/appointments");
      setAppointments(res.appointments);
    };
    void load().finally(() => setLoading(false));
  }, []);

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => ["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(a.status))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [appointments]
  );
  const past = useMemo(
    () =>
      appointments
        .filter((a) => !["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(a.status))
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [appointments]
  );
  const alerts = upcoming.filter((a) => a.status === "RESCHEDULE_REQUESTED" || a.status === "SCHEDULED");

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <h1 className="text-3xl font-bold text-slate-900">My visits</h1>
      <p className="mt-2 text-lg text-slate-600">Coming soon, alerts, and old visits. One page.</p>

      <div className="mt-6">
        <Link href="/patient/book" className="btn-primary text-lg">
          Book a visit
        </Link>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-600">Loading…</p>
      ) : (
        <>
          <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="alerts-h">
            <h2 id="alerts-h" className="text-xl font-semibold text-slate-900">
              Alerts
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-2 text-slate-700">No alerts right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="text-base text-slate-800">
                    {a.status === "RESCHEDULE_REQUESTED"
                      ? `You asked to change ${formatWhen(a.scheduledAt)}. Wait for the clinic.`
                      : `Visit coming: ${formatWhen(a.scheduledAt)}.`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="soon-h">
            <h2 id="soon-h" className="text-xl font-semibold text-slate-900">
              Coming soon
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                title="No visits booked"
                description="Tap Book a visit. A checkup only needs a day."
              />
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-lg font-medium text-slate-900">{formatWhen(a.scheduledAt)}</p>
                    <p className="text-slate-600">{a.reason || a.category}</p>
                    <AppointmentStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="past-h">
            <h2 id="past-h" className="text-xl font-semibold text-slate-900">
              Old visits
            </h2>
            {past.length === 0 ? (
              <p className="mt-2 text-slate-600">No old visits yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {past.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
                    {formatWhen(a.scheduledAt)} — {a.reason || a.category}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-base text-slate-600">
              Need to change a visit?{" "}
              <Link href="/patient/appointments" className="font-semibold text-teal-800 underline">
                Open visit details
              </Link>
              .
            </p>
          </section>
        </>
      )}
    </ProtectedRolePage>
  );
}
