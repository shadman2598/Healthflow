"use client";

import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";

export default function PatientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRolePage allowedRoles={["RECEPTIONIST", "DOCTOR", "ADMIN"]}>
      {children}
    </ProtectedRolePage>
  );
}
