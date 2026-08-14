"use client";

import type { JourneyPhase } from "../../lib/patient-journey";
import { cn } from "../../lib/utils";

type JourneyContinuumProps = {
  phases: JourneyPhase[];
  className?: string;
};

/**
 * Longitudinal care arc — shows where the patient is without dumping every module.
 * "clinic" phases (encounter / Rx / results) stay honest: staff-led.
 */
export function JourneyContinuum({ phases, className }: JourneyContinuumProps) {
  const current = phases.find((p) => p.state === "current");
  return (
    <nav
      className={cn("overflow-x-auto", className)}
      aria-label="Your care journey progress"
    >
      {current ? (
        <p className="sr-only">Current phase: {current.label}</p>
      ) : null}
      <ol className="flex min-w-max items-center gap-1 sm:gap-1.5">
        {phases.map((phase, index) => {
          const isCurrent = phase.state === "current";
          const isDone = phase.state === "done";
          const isClinic = phase.state === "clinic";
          return (
            <li key={phase.id} className="flex items-center gap-1 sm:gap-1.5">
              {index > 0 ? (
                <span
                  className={cn(
                    "h-px w-3 sm:w-4",
                    isDone || isCurrent ? "bg-teal-400" : "bg-slate-200"
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  isCurrent && "bg-teal-600 text-white",
                  isDone && "bg-teal-50 text-teal-800",
                  isClinic && "bg-slate-100 text-slate-500",
                  phase.state === "upcoming" && "bg-slate-50 text-slate-400"
                )}
                aria-current={isCurrent ? "step" : undefined}
                title={isClinic ? "Handled with your clinic care team" : undefined}
              >
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-slate-500">
        Visit day (encounter, orders, results) happens with your clinic — we keep your next step clear before and after.
      </p>
    </nav>
  );
}
