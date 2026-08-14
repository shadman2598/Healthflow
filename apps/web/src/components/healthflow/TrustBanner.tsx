"use client";

import { IconShield } from "../ui/Icons";
import { cn } from "../../lib/utils";

type TrustBannerProps = {
  className?: string;
  /** Short context: messages | profile | booking */
  context?: "messages" | "profile" | "booking" | "general";
};

const COPY: Record<NonNullable<TrustBannerProps["context"]>, string> = {
  messages:
    "Messages stay within your clinic. Staff responses are audited, and this channel is not for emergencies.",
  profile:
    "Your healthcare number is masked by default. Only authorized clinic staff can reveal it, and reveals are logged.",
  booking:
    "Cancel at least 24 hours ahead when possible to avoid a late-cancellation fee. Medically necessary visits are typically covered by provincial insurance.",
  general: "Your session uses secure cookies. Clinic access is role-based and sensitive actions are audited."
};

export function TrustBanner({ className, context = "general" }: TrustBannerProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-950",
        className
      )}
      role="note"
    >
      <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
      <div>
        <p className="font-medium text-teal-900">Private clinic channel</p>
        <p className="mt-0.5 text-teal-900/80">{COPY[context]}</p>
      </div>
    </div>
  );
}
