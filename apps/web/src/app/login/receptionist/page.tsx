"use client";

import { RoleLoginCard } from "../../../components/healthflow/RoleLoginCard";

export default function ReceptionistLoginPage() {
  return (
    <RoleLoginCard
      role="RECEPTIONIST"
      title="Receptionist Portal"
      subtitle="Manage scheduling, intake, and patient communications."
      defaultEmail="receptionist1@healthflow.demo"
    />
  );
}
