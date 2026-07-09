"use client";

import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

type Invite = {
  id: string;
  code: string;
  role: string;
  email: string | null;
  usedAt: string | null;
  expiresAt: string;
};

type ReminderRule = {
  id: string;
  name: string;
  enabled: boolean;
  offsetMinutes: number;
  channel: string;
};

export default function AdminSettingsPage() {
  const { showToast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    const [inviteRes, rulesRes, clinicRes] = await Promise.all([
      apiRequest<{ invites: Invite[] }>("/auth/invites"),
      apiRequest<{ rules: ReminderRule[] }>("/reminder-rules").catch(() => ({ rules: [] })),
      apiRequest<{ clinics: { id: string; name: string }[]; activeOrganizationId: string }>("/auth/clinics")
    ]);
    setInvites(inviteRes.invites);
    setRules(rulesRes.rules);
    const active = clinicRes.clinics.find((c) => c.id === clinicRes.activeOrganizationId);
    setClinicName(active?.name ?? "");
  };

  useEffect(() => {
    load()
      .catch(() => showToast("Failed to load settings", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const createInvite = async (role: "RECEPTIONIST" | "DOCTOR"): Promise<void> => {
    try {
      const res = await apiRequest<{ invite: Invite }>("/auth/invites", {
        method: "POST",
        body: { role, expiresInDays: 30 }
      });
      showToast(`Invite created: ${res.invite.code}`);
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create invite", "error");
    }
  };

  const toggleRule = async (id: string, enabled: boolean): Promise<void> => {
    try {
      await apiRequest(`/reminder-rules/${id}`, { method: "PUT", body: { enabled } });
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to update rule", "error");
    }
  };

  if (loading) {
    return (
      <ProtectedRolePage allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      </ProtectedRolePage>
    );
  }

  return (
    <ProtectedRolePage allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Clinic Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage invites, reminders, and clinic configuration</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Clinic</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Active clinic</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{clinicName}</p>
            <p className="mt-4 text-xs text-slate-400">HTTPS and secure cookies should be enabled in production.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Staff invite codes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => createInvite("RECEPTIONIST")}>New receptionist invite</Button>
              <Button type="button" variant="secondary" onClick={() => createInvite("DOCTOR")}>New doctor invite</Button>
            </div>
            <ul className="space-y-2 text-sm">
              {invites.slice(0, 8).map((invite) => (
                <li key={invite.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="font-mono text-xs">{invite.code}</span>
                  <Badge variant={invite.usedAt ? "secondary" : "success"}>{invite.usedAt ? "Used" : invite.role}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Automated reminder rules</CardTitle></CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-slate-500">No reminder rules configured.</p>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <label key={rule.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                      <p className="text-xs text-slate-500">{rule.offsetMinutes}m before · {rule.channel}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => toggleRule(rule.id, e.target.checked)}
                    />
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRolePage>
  );
}
