"use client";

import { useEffect, useState } from "react";
import type { AnalyticsDashboard } from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconActivity, IconShield } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { isGuestSession } from "../../../lib/guest-session";
import { cn } from "../../../lib/utils";
import { useToast } from "../../../contexts/toast-context";

type AudienceKey = keyof AnalyticsDashboard["audiences"];

const AUDIENCE_ORDER: AudienceKey[] = ["patient", "receptionist", "clinician", "system"];

export default function AdminAnalyticsPage() {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AudienceKey>("patient");

  useEffect(() => {
    if (isGuestSession()) {
      setLoading(false);
      return;
    }
    apiRequest<{ dashboard: AnalyticsDashboard }>("/analytics/dashboard?days=7")
      .then((res) => setDashboard(res.dashboard))
      .catch((error) => {
        showToast(error instanceof ApiError ? error.message : "Failed to load analytics", "error");
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <ProtectedRolePage
      allowedRoles={["ADMIN", "SUPER_ADMIN", "RECEPTIONIST", "DOCTOR"]}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Outcomes analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          {dashboard?.northStar ??
            "How many minutes of unnecessary healthcare work did our platform eliminate today?"}
        </p>
        <p className="mt-2 max-w-2xl text-xs text-slate-500">
          Healthcare OS outcomes — not downloads, screen time, or session vanity. Every metric maps
          to a workflow hypothesis for patients, reception, and clinicians.
        </p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : !dashboard ? (
        <EmptyState
          icon={<IconShield className="h-12 w-12" />}
          title="No analytics yet"
          description="Outcome events will appear as the clinic uses appointments, desk actions, and clinical workflows."
        />
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">North-star (proxy)</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
              {dashboard.estimatedMinutesEliminated}
              <span className="ml-2 text-base font-medium text-slate-600">min eliminated</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Last {dashboard.windowDays} days · calibrate per clinic · not a clinical claim
            </p>
          </section>

          <section className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Not optimizing for</p>
            <p className="mt-1 text-xs">
              {dashboard.rejectedVanityMetrics.map((m) => m.replace(/_/g, " ")).join(" · ")}
            </p>
            <p className="mt-2 text-[11px] text-amber-900/70">
              Patient adoption alone is not enough — systems that add clinician/desk work fail in the
              wild even when patients like them. Window: last {dashboard.windowDays} days ·{" "}
              {dashboard.version} · {new Date(dashboard.generatedAt).toLocaleString()}
            </p>
          </section>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Analytics audience">
            {AUDIENCE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
                  tab === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {key}
              </button>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="audience-headline">
            <div className="mb-4 flex items-start gap-2">
              <IconActivity className="mt-0.5 h-5 w-5 text-brand-700" aria-hidden />
              <div>
                <h2 id="audience-headline" className="text-lg font-semibold capitalize text-slate-900">
                  {tab}
                </h2>
                <p className="text-sm text-slate-500">{dashboard.audiences[tab].headline}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {dashboard.audiences[tab].metrics.map((m) => (
                <article key={m.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{m.label}</h3>
                    <p className="text-2xl font-semibold tabular-nums text-brand-800">{m.value}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Hypothesis: </span>
                    {m.hypothesis}
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                    {m.unit} · {m.higherIsBetter ? "higher better" : "lower better"} · {m.id}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                    {m.contributingEvents.map((e) => (
                      <li key={e.name}>
                        {e.name}: {e.count}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Event totals (window)</h2>
            {dashboard.eventTotals.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No events in this window yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {dashboard.eventTotals.slice(0, 20).map((e) => (
                  <li key={e.name} className="flex justify-between py-2">
                    <span className="font-mono text-xs text-slate-600">{e.name}</span>
                    <span className="tabular-nums text-slate-900">{e.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ProtectedRolePage>
  );
}
