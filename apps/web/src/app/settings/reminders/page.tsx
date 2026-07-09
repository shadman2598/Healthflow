"use client";

import { useEffect, useState } from "react";
import { ProtectedPage } from "../../../components/ProtectedPage";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconSettings, IconMail, IconPhone } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { ReminderRule } from "../../../types/api";

function formatOffset(minutes: number): string {
  if (minutes >= 1440) return `${minutes / 1440}d`;
  if (minutes >= 60) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export default function ReminderSettingsPage() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRules = async (): Promise<void> => {
    const res = await apiRequest<{ rules: ReminderRule[] }>("/reminder-rules");
    setRules(res.rules);
  };

  useEffect(() => {
    loadRules()
      .catch(() => showToast("Failed to load rules", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const toggleRule = async (rule: ReminderRule): Promise<void> => {
    try {
      await apiRequest(`/reminder-rules/${rule.id}`, { method: "PUT", body: { enabled: !rule.enabled } });
      showToast(rule.enabled ? "Rule disabled" : "Rule enabled");
      await loadRules();
    } catch (err) { showToast(err instanceof ApiError ? err.message : "Failed to update", "error"); }
  };

  return (
    <ProtectedPage>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Reminder Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configure when and how reminders are sent to patients.</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<IconSettings className="h-10 w-10" />}
            title="No reminder rules"
            description="Reminder rules will appear here once configured."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-5 px-6 py-5 transition-colors hover:bg-slate-50/50">
                <div className={`rounded-xl p-3 ${rule.channel === "EMAIL" ? "bg-blue-50" : "bg-purple-50"}`}>
                  {rule.channel === "EMAIL" ? (
                    <IconMail className="h-5 w-5 text-blue-600" />
                  ) : (
                    <IconPhone className="h-5 w-5 text-purple-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
                    <StatusBadge variant={rule.channel === "EMAIL" ? "info" : "purple"}>{rule.channel}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Sends {formatOffset(rule.offsetMinutes)} before appointment
                  </p>
                </div>
                <button
                  onClick={() => void toggleRule(rule)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    rule.enabled ? "bg-brand-600" : "bg-slate-200"
                  }`}
                  role="switch"
                  aria-checked={rule.enabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                      rule.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
