"use client";

import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { IconShield } from "../../../components/ui/Icons";
import { apiRequest } from "../../../lib/api";
import type { AuditLog } from "../../../types/healthflow";

function relativeTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ logs: AuditLog[] }>("/audit-logs")
      .then((res) => setLogs(res.logs))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRolePage allowedRoles={["ADMIN", "SUPER_ADMIN"]} requiredPermissions={["audit:read"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500">Compliance and activity trail for your clinic</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<IconShield className="h-12 w-12" />} title="No audit logs" description="Activity will appear here as users interact with the system." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3 font-medium text-slate-600">Time</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Action</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Entity</th>
                  <th className="px-6 py-3 font-medium text-slate-600">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-3.5 text-slate-500">{relativeTime(log.createdAt)}</td>
                    <td className="px-6 py-3.5">
                      <StatusBadge variant="info">{log.action}</StatusBadge>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">{log.entityType}</td>
                    <td className="px-6 py-3.5 text-slate-600">{log.actor?.email ?? "—"}</td>
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
