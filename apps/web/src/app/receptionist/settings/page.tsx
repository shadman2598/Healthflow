"use client";

import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { apiRequest } from "../../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import type { HealthFlowUser } from "../../../types/healthflow";

export default function ReceptionistSettingsPage() {
  const [user, setUser] = useState<HealthFlowUser | null>(null);

  useEffect(() => {
    apiRequest<{ user: HealthFlowUser }>("/auth/me").then((res) => setUser(res.user));
  }, []);

  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Your account and clinic preferences</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-slate-500">Email:</span> {user?.email}</p>
          <p><span className="text-slate-500">Role:</span> Receptionist</p>
          <p><span className="text-slate-500">Clinic:</span> {user?.organization?.name}</p>
          <p className="mt-4 text-xs text-slate-400">
            Admin-only settings (staff management, invite codes) are available to clinic administrators.
          </p>
        </CardContent>
      </Card>
    </ProtectedRolePage>
  );
}
