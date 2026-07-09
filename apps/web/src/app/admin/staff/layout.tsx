"use client";

import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";

export default function AdminStaffLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRolePage allowedRoles={["ADMIN", "SUPER_ADMIN"]}>{children}</ProtectedRolePage>;
}
