"use client";

import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { IconAlertTriangle } from "../../components/ui/Icons";
import { apiRequest } from "../../lib/api";
import { isGuestSession } from "../../lib/guest-session";
import type { OverdueCheckup } from "../../types/healthflow";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function OverdueCheckupsPage() {
  const [overdue, setOverdue] = useState<OverdueCheckup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuestSession()) {
      setOverdue([]);
      setLoading(false);
      return;
    }
    apiRequest<{ overdue: OverdueCheckup[] }>("/patient-profiles/overdue/checkups")
      .then((res) => setOverdue(res.overdue))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Overdue Checkups</h1>
        <p className="mt-1 text-sm text-slate-500">Patients without a completed checkup in the last 12 months</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : overdue.length === 0 ? (
          <EmptyState icon={<IconAlertTriangle className="h-12 w-12" />} title="All patients are up to date" description="No overdue checkups found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3 font-medium text-slate-600">Patient</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Last Checkup</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Days Overdue</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdue.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{p.firstName} {p.lastName}</td>
                    <td className="px-6 py-3.5 text-slate-600">{formatDate(p.lastCheckupDate)}</td>
                    <td className="px-6 py-3.5 font-medium text-red-600">{p.daysOverdue}</td>
                    <td className="px-6 py-3.5">
                      <StatusBadge variant="error" dot>Overdue</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProtectedRolePage>
  );
}
