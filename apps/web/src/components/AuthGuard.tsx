"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "../lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const verify = async (): Promise<void> => {
      try {
        await apiRequest<{ user: { id: string } }>("/auth/me");
        if (active) setReady(true);
      } catch {
        if (pathname !== "/login") router.replace("/login");
      }
    };
    void verify();
    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
