"use client";

import Link from "next/link";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import type { JourneyStep } from "../../lib/patient-journey";
import { cn } from "../../lib/utils";
import type { AppointmentStatus } from "../../types/healthflow";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type WhatsNextCardProps = {
  step: JourneyStep;
  className?: string;
  compact?: boolean;
};

export function WhatsNextCard({ step, className, compact }: WhatsNextCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-slate-50",
        compact ? "p-4" : "p-5 sm:p-6",
        className
      )}
      aria-labelledby="whats-next-title"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{step.eyebrow}</p>
      <h2 id="whats-next-title" className={cn("mt-1 font-semibold text-slate-900", compact ? "text-base" : "text-xl")}>
        {step.title}
      </h2>
      <p className={cn("mt-1 text-slate-600", compact ? "text-xs" : "text-sm")}>{step.body}</p>

      {step.appointment ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">{formatDateTime(step.appointment.scheduledAt)}</span>
          {step.appointment.reason || step.appointment.category ? (
            <span className="text-slate-500">
              · {(step.appointment.reason ?? step.appointment.category?.replace(/_/g, " ")) as string}
            </span>
          ) : null}
          {step.appointment.doctor ? (
            <span className="text-slate-500">
              · Dr. {step.appointment.doctor.firstName} {step.appointment.doctor.lastName}
            </span>
          ) : null}
          {step.appointment.status ? (
            <AppointmentStatusBadge status={step.appointment.status as AppointmentStatus} />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={step.primary.href} className="btn-primary text-sm">
          {step.primary.label}
        </Link>
        {(step.secondary ?? []).map((action) => (
          <Link key={action.href + action.label} href={action.href} className="btn-secondary text-sm">
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
