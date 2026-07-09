"use client";

import { RoleLoginCard } from "../../../components/healthflow/RoleLoginCard";

export default function DoctorLoginPage() {
  return (
    <RoleLoginCard
      role="DOCTOR"
      title="Doctor Portal"
      subtitle="Review your schedule, messages, and clinical tasks."
      defaultEmail="doctor1@healthflow.demo"
    />
  );
}
