"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { DashboardCard } from "../../../components/healthflow/DashboardCard";
import { KpiCard } from "../../../components/ui/KpiCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconActivity, IconAlertTriangle, IconCalendar, IconShield } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import type { AuditLog, HealthFlowAppointment, OverdueCheckup } from "../../../types/healthflow";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminDashboardPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [overdue, setOverdue] = useState<OverdueCheckup[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
        const [todayRes, overdueRes, auditRes] = await Promise.all([
          apiRequest<{ appointments: HealthFlowAppointment[] }>(
            `/appointments?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`
          ),
          apiRequest<{ overdue: OverdueCheckup[] }>("/patient-profiles/overdue/checkups"),
          apiRequest<{ logs: AuditLog[] }>("/audit-logs").catch(() => ({ logs: [] }))
        ]);
        setAppointments(todayRes.appointments);
        setOverdue(overdueRes.overdue);
        setAuditLogs(auditRes.logs);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <ProtectedRolePage allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Clinic oversight and compliance</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Today's Appointments" value={appointments.length} icon={<IconCalendar className="h-6 w-6" />} />
            <KpiCard title="Overdue Checkups" value={overdue.length} icon={<IconAlertTriangle className="h-6 w-6" />} iconBg="bg-red-50 text-red-500" />
            <KpiCard title="Recent Audit Events" value={auditLogs.length} icon={<IconShield className="h-6 w-6" />} iconBg="bg-teal-50 text-teal-600" />
            <KpiCard title="Clinic Activity" value={auditLogs.filter((l) => l.action.includes("CREATE")).length} icon={<IconActivity className="h-6 w-6" />} iconBg="bg-purple-50 text-purple-600" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <DashboardCard title="Recent Audit Activity" href="/admin/audit-logs">
              {auditLogs.length === 0 ? (
                <EmptyState icon={<IconShield className="h-10 w-10" />} title="No audit logs yet" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {auditLogs.slice(0, 6).map((log) => (
                    <div key={log.id} className="flex items-start justify-between gap-4 px-6 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{log.action}</p>
                        <p className="text-xs text-slate-500">{log.entityType} · {log.actor?.email ?? "System"}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{relativeTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Overdue Patients" href="/overdue-checkups">
              {overdue.length === 0 ? (
                <EmptyState icon={<IconAlertTriangle className="h-10 w-10" />} title="All patients current" />
              ) : (
                <div className="divide-y divide-slate-100 -mx-6 -my-6">
                  {overdue.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-6 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{p.firstName} {p.lastName}</p>
                      <span className="text-xs font-medium text-red-600">{p.daysOverdue}d overdue</span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/admin/analytics" className="btn-primary">Outcomes analytics</Link>
            <Link href="/admin/audit-logs" className="btn-secondary">Audit Logs</Link>
            <Link href="/overdue-checkups" className="btn-secondary">Overdue Checkups</Link>
            <Link href="/calendar" className="btn-secondary">Calendar</Link>
          </div>
        </>
      )}
    </ProtectedRolePage>
  );
}
