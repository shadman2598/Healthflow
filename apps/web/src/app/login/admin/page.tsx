"use client";

import { RoleLoginCard } from "../../../components/healthflow/RoleLoginCard";

export default function AdminLoginPage() {
  return (
    <RoleLoginCard
      role="ADMIN"
      title="Administrator Portal"
      subtitle="Clinic oversight, audit logs, and staff management."
      defaultEmail="admin@healthflow.demo"
    />
  );
}
