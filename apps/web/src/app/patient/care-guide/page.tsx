"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconCalendar, IconChat, IconCheckCircle, IconClipboard, IconSearch, IconShield } from "../../../components/ui/Icons";
import {
  CARE_DISCLAIMER,
  CARE_PATHWAYS,
  searchClinicAssistant,
  resolveCareOutcome,
  urgencyStyles,
  VISIT_PREP_BASE,
  VISIT_PREP_BY_CATEGORY,
  type CareOutcome,
  type CarePathway,
  type ClinicAssistHit,
  type VisitPrepItem
} from "../../../lib/care-guide";
import { CLINIC_FEE_CATEGORIES } from "../../../lib/clinic-fees";
import { loadPrepProgress, savePrepProgress } from "../../../lib/patient-journey";
import { apiRequest } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import type { HealthFlowAppointment } from "../../../types/healthflow";

type TabId = "guide" | "prep" | "ask";

function feeAssistHits(): ClinicAssistHit[] {
  return CLINIC_FEE_CATEGORIES.flatMap((cat) =>
    cat.fees.map((fee) => ({
      id: `fee-${fee.id}`,
      kind: "fee" as const,
      title: `${fee.name} — ${fee.cost}`,
      body: fee.description,
      href: "/resources"
    }))
  );
}

export default function CareGuidePage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["PATIENT"]}>
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        </ProtectedRolePage>
      }
    >
      <CareGuideContent />
    </Suspense>
  );
}

function CareGuideContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId | null) ?? "guide";
  const [tab, setTab] = useState<TabId>(["guide", "prep", "ask"].includes(initialTab) ? initialTab : "guide");

  const [pathway, setPathway] = useState<CarePathway | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [outcome, setOutcome] = useState<CareOutcome | null>(null);

  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [doctorQuestions, setDoctorQuestions] = useState("");

  const [askQuery, setAskQuery] = useState("");
  const feeHits = useMemo(() => feeAssistHits(), []);
  const askResults = useMemo(() => searchClinicAssistant(askQuery, feeHits), [askQuery, feeHits]);

  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (t && ["guide", "prep", "ask"].includes(t)) setTab(t);
  }, [searchParams]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const { isGuestSession } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setAppointments([]);
          return;
        }
        const now = new Date().toISOString();
        const res = await apiRequest<{ appointments: HealthFlowAppointment[] }>(
          `/appointments?from=${encodeURIComponent(now)}`
        ).catch(() => ({ appointments: [] as HealthFlowAppointment[] }));
        setAppointments(
          res.appointments
            .filter((a) => !["CANCELLED", "MISSED", "COMPLETED"].includes(a.status))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        );
      } catch {
        setAppointments([]);
      }
    };
    void load();
  }, []);

  const nextAppt = appointments[0] ?? null;
  const prepItems: VisitPrepItem[] = useMemo(() => {
    const extras = nextAppt ? VISIT_PREP_BY_CATEGORY[nextAppt.category] ?? VISIT_PREP_BY_CATEGORY.OTHER : VISIT_PREP_BY_CATEGORY.OTHER;
    return [...VISIT_PREP_BASE, ...extras];
  }, [nextAppt]);

  useEffect(() => {
    const saved = loadPrepProgress();
    if (!saved) return;
    if (nextAppt && saved.appointmentId && saved.appointmentId !== nextAppt.id) return;
    const map: Record<string, boolean> = {};
    for (const id of saved.checkedIds) map[id] = true;
    setChecked(map);
  }, [nextAppt?.id]);

  useEffect(() => {
    const checkedIds = Object.entries(checked)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (checkedIds.length === 0 && !nextAppt) return;
    savePrepProgress({
      appointmentId: nextAppt?.id,
      checkedIds,
      updatedAt: new Date().toISOString()
    });
  }, [checked, nextAppt?.id]);

  const resetGuide = (): void => {
    setPathway(null);
    setStep(0);
    setAnswers({});
    setOutcome(null);
  };

  const choosePathway = (p: CarePathway): void => {
    setPathway(p);
    setStep(0);
    setAnswers({});
    setOutcome(null);
    if (p.questions.length === 0) {
      setOutcome(resolveCareOutcome(p, {}));
    }
  };

  const answerQuestion = (yes: boolean): void => {
    if (!pathway) return;
    const q = pathway.questions[step];
    const nextAnswers = { ...answers, [q.id]: yes };
    setAnswers(nextAnswers);

    if (yes && q.yesMeans !== "continue") {
      setOutcome(resolveCareOutcome(pathway, nextAnswers));
      return;
    }

    if (step + 1 >= pathway.questions.length) {
      setOutcome(resolveCareOutcome(pathway, nextAnswers));
      return;
    }
    setStep(step + 1);
  };

  const copyQuestionsToMessage = (): string => {
    const lines = [
      "Visit prep notes from HealthFlow Care Guide:",
      nextAppt
        ? `Upcoming: ${new Date(nextAppt.scheduledAt).toLocaleString()} (${nextAppt.reason ?? nextAppt.category})`
        : "No upcoming appointment on file.",
      "",
      "Questions for my clinician:",
      doctorQuestions.trim() || "(add your questions)"
    ];
    return lines.join("\n");
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Care Guide</h1>
        <p className="mt-1 text-sm text-slate-500">
          Decide next steps, prepare for visits, and find clinic answers — without replacing your care team.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Important</p>
        <p className="mt-1 leading-relaxed">{CARE_DISCLAIMER}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            { id: "guide" as const, label: "What should I do?", icon: IconClipboard },
            { id: "prep" as const, label: "Visit prep", icon: IconCalendar },
            { id: "ask" as const, label: "Ask the clinic", icon: IconSearch }
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                tab === item.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "guide" ? (
        <div className="space-y-6">
          {!pathway ? (
            <>
              <p className="text-sm text-slate-600">
                Choose what best matches your situation. Inspired by apps like Ada and Buoy — but this version only routes you to clinic actions, never diagnoses conditions.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CARE_PATHWAYS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePathway(p)}
                    className="card p-5 text-left transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.summary}</p>
                  </button>
                ))}
              </div>
            </>
          ) : outcome ? (
            <div className={cn("rounded-xl border p-6", urgencyStyles(outcome.level).panel)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide", urgencyStyles(outcome.level).badge)}>
                  {outcome.level.replace("_", " ")}
                </span>
                <span className="text-xs text-slate-500">{pathway.title}</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">{outcome.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{outcome.body}</p>
              {pathway.tips.length > 0 ? (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {pathway.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-2">
                {outcome.actions.map((action) => (
                  <Link
                    key={action.href + action.label}
                    href={action.href}
                    className={action.primary ? "btn-primary" : "btn-secondary"}
                  >
                    {action.label}
                  </Link>
                ))}
                <button type="button" className="btn-secondary" onClick={resetGuide}>
                  Start over
                </button>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {pathway.title} · Question {step + 1} of {pathway.questions.length}
              </p>
              <h2 className="mt-3 text-lg font-semibold text-slate-900">{pathway.questions[step]?.prompt}</h2>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={() => answerQuestion(true)}>
                  Yes
                </button>
                <button type="button" className="btn-secondary" onClick={() => answerQuestion(false)}>
                  No
                </button>
                <button type="button" className="btn-secondary" onClick={resetGuide}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {tab === "prep" ? (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                <IconCalendar className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Visit prep</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Like MyChart visit preparation: a practical checklist so you get more from the appointment.
                </p>
                {nextAppt ? (
                  <p className="mt-3 text-sm text-slate-700">
                    Next visit:{" "}
                    <span className="font-medium">
                      {new Date(nextAppt.scheduledAt).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    {" · "}
                    {nextAppt.reason ?? nextAppt.category.replace("_", " ")}
                    {nextAppt.doctor ? ` · Dr. ${nextAppt.doctor.lastName}` : ""}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No upcoming appointment loaded — showing a general checklist. Sign in for visit-specific tips.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card divide-y divide-slate-100">
            {prepItems.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 px-6 py-4">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!checked[item.id]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                  {item.detail ? <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span> : null}
                </span>
                {checked[item.id] ? <IconCheckCircle className="ml-auto h-5 w-5 shrink-0 text-teal-600" /> : null}
              </label>
            ))}
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-slate-900">Questions for my clinician</h3>
            <p className="mt-1 text-xs text-slate-500">Jot these down now — you can paste them into a clinic message.</p>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={4}
              placeholder={"Example:\n1. Are my symptoms expected to improve in a week?\n2. Do I need any tests before the next visit?"}
              value={doctorQuestions}
              onChange={(e) => setDoctorQuestions(e.target.value)}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/messages?draft=${encodeURIComponent(copyQuestionsToMessage())}`}
                className="btn-primary"
              >
                <IconChat className="h-4 w-4" />
                Open Messages with notes
              </Link>
              <Link href="/patient/appointments" className="btn-secondary">
                Appointment History
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "ask" ? (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Ask the clinic</h2>
            <p className="mt-1 text-sm text-slate-500">
              Portal-style assistant (like MyChart Emmie for navigation): search fees, FAQ, and how-to answers. Not clinical advice.
            </p>
            <div className="relative mt-4">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm"
                placeholder='Try “sick note”, “reschedule”, “pharmacy”, “privacy”…'
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
              />
            </div>
          </div>

          {askResults.length === 0 ? (
            <EmptyState icon={<IconSearch className="h-10 w-10" />} title="No matches" description="Try a shorter keyword or browse FAQ." />
          ) : (
            <div className="space-y-3">
              {askResults.map((hit) => (
                <div key={hit.id} className="card p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {hit.kind}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">{hit.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{hit.body}</p>
                  {hit.href ? (
                    <Link href={hit.href} className="mt-3 inline-flex text-sm font-medium text-brand-600 hover:text-brand-700">
                      Open related page →
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <p className="mt-10 text-center text-xs text-slate-400">
        <IconShield className="mr-1 inline h-3.5 w-3.5" />
        HealthFlow Care Guide supports clinic navigation only — not diagnosis or emergency care.
      </p>
    </ProtectedRolePage>
  );
}
