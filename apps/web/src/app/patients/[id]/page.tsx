"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SecureFieldReveal } from "../../../components/healthflow/SecureFieldReveal";
import { AppointmentStatusBadge } from "../../../components/healthflow/AppointmentStatusBadge";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowAppointment } from "../../../types/healthflow";
import { IconArrowLeft } from "../../../components/ui/Icons";

type ProfileDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  healthcareNumber: string;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  address?: string | null;
  internalNotes?: string | null;
  isRegularPatient?: boolean;
  appointments?: HealthFlowAppointment[];
  assignedDoctor?: { firstName: string; lastName: string } | null;
};

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ profile: ProfileDetail }>(`/patient-profiles/${params.id}`)
      .then((res) => setProfile(res.profile))
      .catch((error) => {
        showToast(error instanceof ApiError ? error.message : "Failed to load profile", "error");
      })
      .finally(() => setLoading(false));
  }, [params.id, showToast]);

  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="card p-8 text-center text-sm text-slate-500">Patient not found.</div>;
  }

  const upcoming = (profile.appointments ?? []).filter(
    (a) => new Date(a.scheduledAt) >= new Date() && a.status !== "CANCELLED"
  );
  const history = (profile.appointments ?? []).filter(
    (a) => new Date(a.scheduledAt) < new Date() || a.status === "COMPLETED"
  );

  return (
    <div className="space-y-6">
      <Link href="/patients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <IconArrowLeft className="h-4 w-4" />
        Back to patients
      </Link>

      <div className="card p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {profile.firstName} {profile.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{profile.email} · {profile.phone}</p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-slate-400">Healthcare number</dt>
            <dd className="mt-1">
              <SecureFieldReveal profileId={profile.id} maskedValue={profile.healthcareNumber} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-400">Date of birth</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-400">Height / Weight</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {profile.heightCm ? `${profile.heightCm} cm` : "—"} / {profile.weightKg ? `${profile.weightKg} kg` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-400">Assigned doctor</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {profile.assignedDoctor
                ? `Dr. ${profile.assignedDoctor.firstName} ${profile.assignedDoctor.lastName}`
                : "—"}
            </dd>
          </div>
        </dl>

        {profile.internalNotes ? (
          <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
            <p className="text-xs font-medium uppercase text-amber-700">Staff notes (internal)</p>
            <p className="mt-2 text-sm text-amber-900">{profile.internalNotes}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming appointments</h2>
          <ul className="mt-4 space-y-3">
            {upcoming.length === 0 ? (
              <li className="text-sm text-slate-500">No upcoming appointments.</li>
            ) : (
              upcoming.map((appt) => (
                <li key={appt.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(appt.scheduledAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">{appt.reason ?? "Appointment"}</p>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Appointment history</h2>
          <ul className="mt-4 space-y-3">
            {history.length === 0 ? (
              <li className="text-sm text-slate-500">No past appointments.</li>
            ) : (
              history.map((appt) => (
                <li key={appt.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(appt.scheduledAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">{appt.reason ?? "Appointment"}</p>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
