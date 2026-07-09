"use client";

import Link from "next/link";
import { Avatar } from "../ui/Avatar";
import { EmptyState } from "../ui/EmptyState";
import { IconUsers } from "../ui/Icons";

export type PatientRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  healthcareNumber?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  isRegularPatient?: boolean;
  totalVisits?: number;
  lastAppointmentDate?: string | null;
  nextAppointmentDate?: string | null;
  appointments?: { scheduledAt: string; status: string }[];
  createdAt?: string;
};

type PatientTableProps = {
  patients: PatientRow[];
  loading?: boolean;
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function PatientTable({ patients, loading }: PatientTableProps) {
  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Loading patients...</div>;
  }

  if (patients.length === 0) {
    return (
      <EmptyState
        icon={<IconUsers className="h-8 w-8 text-slate-400" />}
        title="No patients found"
        description="Try adjusting search or add a new patient."
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">HCN</th>
              <th className="px-4 py-3">Height</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Last visit</th>
              <th className="px-4 py-3">Next visit</th>
              <th className="px-4 py-3">Visits</th>
              <th className="px-4 py-3">Regular</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-slate-50 hover:bg-brand-50/30">
                <td className="px-4 py-3">
                  <Link href={`/patients/${patient.id}`} className="flex items-center gap-3">
                    <Avatar name={`${patient.firstName} ${patient.lastName}`} size="sm" />
                    <span className="font-medium text-slate-900">
                      {patient.firstName} {patient.lastName}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{patient.email}</div>
                  <div className="text-xs text-slate-400">{patient.phone}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {patient.healthcareNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{patient.heightCm ? `${patient.heightCm} cm` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{patient.weightKg ? `${patient.weightKg} kg` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(patient.lastAppointmentDate)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(patient.nextAppointmentDate)}</td>
                <td className="px-4 py-3 text-slate-600">{patient.totalVisits ?? 0}</td>
                <td className="px-4 py-3">
                  {patient.isRegularPatient ? (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Regular
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
