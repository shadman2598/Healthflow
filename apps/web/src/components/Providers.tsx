"use client";

import { ToastProvider } from "../contexts/toast-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
