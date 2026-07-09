"use client";

import { RoleLoginCard } from "../../../components/healthflow/RoleLoginCard";

export default function PatientLoginPage() {
  return (
    <RoleLoginCard
      role="PATIENT"
      title="Patient Portal"
      subtitle="Access your appointments, messages, and health resources."
      defaultEmail="patient1@healthflow.demo"
    />
  );
}
