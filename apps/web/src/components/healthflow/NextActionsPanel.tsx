"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NextAction } from "@technovate/shared";
import { ApiError, apiRequest } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/toast-context";

function urgencyClass(urgency: NextAction["urgency"]): string {
  switch (urgency) {
    case "critical":
    case "high":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "low":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-teal-200 bg-teal-50 text-teal-950";
  }
}

type NextActionsPanelProps = {
  className?: string;
  title?: string;
};

export function NextActionsPanel({ className, title = "Next best action" }: NextActionsPanelProps) {
  const { showToast } = useToast();
  const [actions, setActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ actions: NextAction[] }>("/next-actions");
      setActions(res.actions ?? []);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to load next actions", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (auditKey: string, path: "dismiss" | "complete") => {
    try {
      await apiRequest(`/next-actions/${path}`, {
        method: "POST",
        body: { auditKey }
      });
      showToast(path === "dismiss" ? "Action dismissed (reversible)" : "Marked complete");
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Update failed", "error");
    }
  };

  if (loading) {
    return (
      <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}>
        <p className="text-sm text-slate-500">Computing next actions…</p>
      </section>
    );
  }

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)} aria-labelledby="next-action-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="next-action-title" className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Workflow recommendations only — not diagnosis or prescribing. Dismiss is reversible.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {actions.map((a) => (
          <li key={a.auditKey} className={cn("rounded-lg border px-3 py-2", urgencyClass(a.urgency))}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Link href={a.href} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <p className="mt-0.5 text-xs opacity-90">{a.reason}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
                  {a.kind.replace(/_/g, " ")} · {a.role} · {a.urgency} · {a.status}
                </p>
                <p className="mt-0.5 text-[10px] opacity-60">
                  Source: {a.sources.map((s) => s.type + (s.id ? `:${s.id}` : "")).join(", ")} ·{" "}
                  {new Date(a.computedAt).toLocaleString()}
                </p>
              </div>
              {a.kind !== "idle_clear" ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="rounded border border-current/20 px-2 py-0.5 text-[10px] font-medium"
                    onClick={() => void decide(a.auditKey, "complete")}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="rounded border border-current/20 px-2 py-0.5 text-[10px] font-medium"
                    onClick={() => void decide(a.auditKey, "dismiss")}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
