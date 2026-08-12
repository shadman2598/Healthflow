"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy mock chat — production messaging lives at /messages. */
export default function PatientMessagesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/messages");
  }, [router]);

  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-500">
      Redirecting to messages…
    </div>
  );
}
