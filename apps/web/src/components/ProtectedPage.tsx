"use client";

import { AppShell } from "./AppShell";
import { AuthGuard } from "./AuthGuard";

export function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
