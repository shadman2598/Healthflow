/**
 * Clinician cockpit brief (Prompt 35).
 * Answers WHO / WHY / WHAT happened / WHAT changed / WHAT matters today / WHAT next
 * without dumping raw charts. External clinical SoR (meds, allergies, labs) stays honest.
 */

export const COCKPIT_CLICK_BUDGETS = {
  /** Select next patient from today’s schedule. */
  openNextPatient: 1,
  /** Jump to a related message thread. */
  openRelatedMessage: 1,
  /** Open structured patient chart. */
  openPatientChart: 1,
  /** Start a follow-up message draft. */
  draftFollowUp: 1,
  /** Return to clinician home. */
  backToDashboard: 1
} as const;

export type CockpitWorkflowId = keyof typeof COCKPIT_CLICK_BUDGETS;

export function measureCockpitClicks(workflow: CockpitWorkflowId): number {
  return COCKPIT_CLICK_BUDGETS[workflow];
}

/** Rough scan budget for the focused brief (seconds). */
export const COCKPIT_PREP_SCAN_SECONDS = 45;

export type CockpitSectionId =
  | "who"
  | "why"
  | "prep"
  | "history"
  | "changed"
  | "today"
  | "medications"
  | "allergies"
  | "results"
  | "documents"
  | "patient_reported"
  | "pending_tasks"
  | "follow_up";

export type CockpitPriority = "critical" | "high" | "normal" | "low" | "external";

export type CockpitFact = {
  id: string;
  section: CockpitSectionId;
  label: string;
  value: string;
  priority: CockpitPriority;
  href?: string;
  source?: string;
};

export type CockpitSection = {
  id: CockpitSectionId;
  title: string;
  purpose: string;
  facts: CockpitFact[];
};

export type CockpitVisit = {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  category?: string;
  patientNotes?: string | null;
  staffNotes?: string | null;
  checkedInAt?: string | null;
  patientName?: string;
  profileId?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  healthcareNumberMasked?: string | null;
};

export type CockpitThread = {
  id: string;
  status: string;
  subject: string;
  patientProfileId?: string | null;
  assignedDoctorId?: string | null;
};

export type CockpitPriorVisit = {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  category?: string;
};

export type ClinicianCockpitInput = {
  focus: CockpitVisit | null;
  todaySchedule: CockpitVisit[];
  priorVisits?: CockpitPriorVisit[];
  threads?: CockpitThread[];
  doctorProfileId?: string | null;
  now?: Date;
};

export type ClinicianBrief = {
  appointmentId: string | null;
  patientName: string;
  headline: {
    who: string;
    why: string;
    previously: string;
    changed: string;
    today: string;
    next: string;
  };
  sections: CockpitSection[];
  schedule: Array<{
    id: string;
    time: string;
    label: string;
    status: string;
    href: string;
    isFocus: boolean;
    checkedIn: boolean;
  }>;
  nextActions: Array<{ id: string; label: string; href: string; clicks: number; reason: string }>;
  clickBudgets: typeof COCKPIT_CLICK_BUDGETS;
  prepScanSeconds: number;
};

const DONE = new Set(["COMPLETED", "CANCELLED", "MISSED"]);

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function visitLabel(v: { reason?: string | null; category?: string }): string {
  return v.reason?.trim() || v.category?.replace(/_/g, " ") || "Visit";
}

function ageYears(dob: string | null | undefined, now: Date): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? `${age}y` : null;
}

function externalFact(section: CockpitSectionId, id: string, label: string, system: string): CockpitFact {
  return {
    id,
    section,
    label,
    value: `Not in HealthFlow — review ${system}. Do not re-enter here.`,
    priority: "external",
    source: "external_ehr"
  };
}

/**
 * Build a prioritized encounter brief from clinic-owned signals only.
 */
export function buildClinicianBrief(input: ClinicianCockpitInput): ClinicianBrief {
  const now = input.now ?? new Date();
  const focus = input.focus;
  const name = focus?.patientName ?? "Patient";
  const why = focus ? visitLabel(focus) : "No encounter selected";
  const priors = [...(input.priorVisits ?? [])]
    .filter((v) => v.id !== focus?.id)
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const lastCompleted = priors.find((v) => v.status === "COMPLETED") ?? priors[0] ?? null;

  const relatedThreads = (input.threads ?? []).filter((t) => {
    if (focus?.profileId) return t.patientProfileId === focus.profileId;
    return t.status === "PENDING" || t.status === "UNREAD";
  });
  const pendingThreads = relatedThreads.filter((t) => t.status === "PENDING" || t.status === "UNREAD");

  const previously = lastCompleted
    ? `${visitLabel(lastCompleted)} · ${new Date(lastCompleted.scheduledAt).toLocaleDateString()} (${lastCompleted.status.replace(/_/g, " ")})`
    : "No prior visits in HealthFlow for this patient";

  let changed = "No prior visit to compare";
  if (focus && lastCompleted) {
    const parts: string[] = [];
    if (visitLabel(focus) !== visitLabel(lastCompleted)) {
      parts.push(`Reason shifted: ${visitLabel(lastCompleted)} → ${visitLabel(focus)}`);
    }
    if ((focus.category ?? "") !== (lastCompleted.category ?? "")) {
      parts.push(`Type: ${(lastCompleted.category ?? "—").replace(/_/g, " ")} → ${(focus.category ?? "—").replace(/_/g, " ")}`);
    }
    if (focus.patientNotes?.trim()) parts.push("New patient-reported notes for this visit");
    if (focus.staffNotes?.trim()) parts.push("Desk left staff notes");
    changed = parts.length > 0 ? parts.join(" · ") : "Same visit type as last recorded encounter — scan notes for nuance";
  } else if (focus?.patientNotes?.trim() || focus?.staffNotes?.trim()) {
    changed = "Notes present for today’s visit (no prior encounter on file)";
  }

  const todayBits: string[] = [];
  if (focus?.checkedInAt) todayBits.push("Checked in — ready when you are");
  else if (focus?.status === "CONFIRMED") todayBits.push("Confirmed — awaiting arrival / check-in");
  else if (focus?.status === "SCHEDULED") todayBits.push("Not yet confirmed by patient");
  if (focus?.patientNotes?.trim()) todayBits.push("Patient wrote notes");
  if (pendingThreads.length) todayBits.push(`${pendingThreads.length} open message${pendingThreads.length === 1 ? "" : "s"}`);
  const today = todayBits.length > 0 ? todayBits.join(" · ") : "Open the brief sections below — keep the chart thin";

  const next =
    pendingThreads.length > 0
      ? "Triage related messages after the encounter"
      : focus?.status === "COMPLETED"
        ? "Document follow-up if needed"
        : focus
          ? "See the patient — then set follow-up in one message"
          : "Pick the next visit from today’s schedule";

  const whoFacts: CockpitFact[] = focus
    ? [
        {
          id: "who-name",
          section: "who",
          label: "Patient",
          value: name,
          priority: "high",
          href: focus.profileId ? `/patients/${focus.profileId}` : undefined,
          source: "profile"
        },
        ...(ageYears(focus.dateOfBirth, now)
          ? [
              {
                id: "who-age",
                section: "who" as const,
                label: "Age",
                value: ageYears(focus.dateOfBirth, now)!,
                priority: "normal" as const,
                source: "profile"
              }
            ]
          : []),
        ...(focus.phone
          ? [
              {
                id: "who-phone",
                section: "who" as const,
                label: "Phone",
                value: focus.phone,
                priority: "low" as const,
                source: "profile"
              }
            ]
          : [])
      ]
    : [
        {
          id: "who-empty",
          section: "who",
          label: "Patient",
          value: "Select a visit from today’s schedule",
          priority: "normal"
        }
      ];

  const whyFacts: CockpitFact[] = [
    {
      id: "why-reason",
      section: "why",
      label: "Chief reason",
      value: why,
      priority: "critical",
      source: focus?.reason ? "receptionist_entered" : "category"
    },
    ...(focus?.category
      ? [
          {
            id: "why-cat",
            section: "why" as const,
            label: "Visit type",
            value: focus.category.replace(/_/g, " "),
            priority: "normal" as const
          }
        ]
      : [])
  ];

  const prepFacts: CockpitFact[] = [
    {
      id: "prep-status",
      section: "prep",
      label: "Arrival",
      value: focus?.checkedInAt
        ? `Checked in ${timeLabel(focus.checkedInAt)}`
        : focus
          ? `${focus.status.replace(/_/g, " ")} — not checked in`
          : "—",
      priority: focus?.checkedInAt ? "high" : "normal"
    },
    ...(focus?.staffNotes?.trim()
      ? [
          {
            id: "prep-staff",
            section: "prep" as const,
            label: "Desk notes",
            value: focus.staffNotes.trim(),
            priority: "high" as const,
            source: "receptionist_entered"
          }
        ]
      : [])
  ];

  const historyFacts: CockpitFact[] =
    priors.length === 0
      ? [
          {
            id: "hist-empty",
            section: "history",
            label: "Longitudinal",
            value: "No prior HealthFlow visits — ask only what’s missing",
            priority: "low"
          }
        ]
      : priors.slice(0, 4).map((v, i) => ({
          id: `hist-${v.id}`,
          section: "history" as const,
          label: i === 0 ? "Most recent" : `Prior ${i + 1}`,
          value: `${new Date(v.scheduledAt).toLocaleDateString()} · ${visitLabel(v)} · ${v.status.replace(/_/g, " ")}`,
          priority: (i === 0 ? "high" : "normal") as CockpitPriority
        }));

  const changedFacts: CockpitFact[] = [
    {
      id: "chg-summary",
      section: "changed",
      label: "Since last visit",
      value: changed,
      priority: changed.includes("shifted") || changed.includes("New patient") ? "high" : "normal"
    }
  ];

  const todayFacts: CockpitFact[] = [
    {
      id: "today-summary",
      section: "today",
      label: "Signal",
      value: today,
      priority: "high"
    }
  ];

  const patientReported: CockpitFact[] = focus?.patientNotes?.trim()
    ? [
        {
          id: "pr-notes",
          section: "patient_reported",
          label: "Patient notes",
          value: focus.patientNotes.trim(),
          priority: "high",
          source: "patient_provided"
        }
      ]
    : [
        {
          id: "pr-empty",
          section: "patient_reported",
          label: "Patient notes",
          value: "None for this visit — don’t re-collect if desk already asked",
          priority: "low"
        }
      ];

  const pendingFacts: CockpitFact[] =
    pendingThreads.length === 0
      ? [
          {
            id: "task-clear",
            section: "pending_tasks",
            label: "Inbox",
            value: "No pending messages for this patient",
            priority: "low"
          }
        ]
      : pendingThreads.slice(0, 5).map((t) => ({
          id: `task-${t.id}`,
          section: "pending_tasks" as const,
          label: "Message",
          value: t.subject,
          priority: "high" as const,
          href: `/messages?threadId=${encodeURIComponent(t.id)}`
        }));

  const needsFollowUp =
    focus?.category === "FOLLOW_UP" ||
    focus?.category === "LAB_REVIEW" ||
    focus?.category === "MEDICATION" ||
    Boolean(lastCompleted && focus && visitLabel(focus).toLowerCase().includes("follow"));

  const followFacts: CockpitFact[] = [
    {
      id: "fu-req",
      section: "follow_up",
      label: "Follow-up",
      value: needsFollowUp
        ? "This visit type usually needs a clear next step — message reception or the patient once"
        : "Set follow-up only if clinically required — avoid default callbacks",
      priority: needsFollowUp ? "high" : "normal",
      href: focus?.profileId
        ? `/messages?draft=${encodeURIComponent(
            `Follow-up after ${why} on ${focus.scheduledAt ? new Date(focus.scheduledAt).toLocaleDateString() : "today"}:\n\n`
          )}`
        : "/messages"
    }
  ];

  const sections: CockpitSection[] = [
    { id: "who", title: "Who", purpose: "Identity only — not the whole chart", facts: whoFacts },
    { id: "why", title: "Why today", purpose: "Chief reason for this encounter", facts: whyFacts },
    { id: "prep", title: "Patient preparation", purpose: "Arrival + desk context", facts: prepFacts },
    { id: "history", title: "Concise history", purpose: "Last few HealthFlow visits — not a dump", facts: historyFacts },
    { id: "changed", title: "What changed", purpose: "Delta since last encounter", facts: changedFacts },
    { id: "today", title: "Important today", purpose: "Signals that change how you walk in", facts: todayFacts },
    {
      id: "medications",
      title: "Medications",
      purpose: "EHR-owned — HealthFlow does not invent a med list",
      facts: [externalFact("medications", "meds", "Active meds", "EHR / pharmacy")]
    },
    {
      id: "allergies",
      title: "Allergies",
      purpose: "Safety-critical — confirm in source system",
      facts: [externalFact("allergies", "allergy", "Allergies", "EHR")]
    },
    {
      id: "results",
      title: "Recent results",
      purpose: "Labs/imaging stay in the clinical SoR",
      facts: [externalFact("results", "labs", "Labs / imaging", "LIS / EHR")]
    },
    {
      id: "documents",
      title: "Relevant documents",
      purpose: "Letters/PDFs are not a second document store here",
      facts: [externalFact("documents", "docs", "Documents", "EHR document store")]
    },
    {
      id: "patient_reported",
      title: "Patient-reported",
      purpose: "What the patient already typed — reuse it",
      facts: patientReported
    },
    { id: "pending_tasks", title: "Pending tasks", purpose: "Inbox items tied to this patient", facts: pendingFacts },
    { id: "follow_up", title: "Follow-up", purpose: "One clear next step after the visit", facts: followFacts }
  ];

  const schedule = [...input.todaySchedule]
    .filter((a) => !DONE.has(a.status) || a.id === focus?.id)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .map((a) => ({
      id: a.id,
      time: timeLabel(a.scheduledAt),
      label: a.patientName ?? "Patient",
      status: a.status,
      href: `/doctor/cockpit?appointmentId=${encodeURIComponent(a.id)}`,
      isFocus: a.id === focus?.id,
      checkedIn: Boolean(a.checkedInAt)
    }));

  const nextActions: ClinicianBrief["nextActions"] = [];
  if (focus?.profileId) {
    nextActions.push({
      id: "chart",
      label: "Open patient chart",
      href: `/patients/${focus.profileId}`,
      clicks: COCKPIT_CLICK_BUDGETS.openPatientChart,
      reason: "Demographics & visit list"
    });
  }
  if (pendingThreads[0]) {
    nextActions.push({
      id: "msg",
      label: "Open related message",
      href: `/messages?threadId=${encodeURIComponent(pendingThreads[0].id)}`,
      clicks: COCKPIT_CLICK_BUDGETS.openRelatedMessage,
      reason: pendingThreads[0].subject
    });
  } else {
    nextActions.push({
      id: "inbox",
      label: "Clinic inbox",
      href: "/messages",
      clicks: COCKPIT_CLICK_BUDGETS.openRelatedMessage,
      reason: "Triage if anything new arrived"
    });
  }
  const follow = followFacts[0];
  if (follow?.href) {
    nextActions.push({
      id: "follow",
      label: "Draft follow-up",
      href: follow.href,
      clicks: COCKPIT_CLICK_BUDGETS.draftFollowUp,
      reason: "One message after the encounter"
    });
  }
  const nextSlot = schedule.find((s) => !s.isFocus);
  if (nextSlot) {
    nextActions.push({
      id: "next-pt",
      label: `Next: ${nextSlot.label}`,
      href: nextSlot.href,
      clicks: COCKPIT_CLICK_BUDGETS.openNextPatient,
      reason: `${nextSlot.time} · ${nextSlot.status.replace(/_/g, " ")}`
    });
  }

  return {
    appointmentId: focus?.id ?? null,
    patientName: name,
    headline: {
      who: name,
      why,
      previously,
      changed,
      today,
      next
    },
    sections,
    schedule,
    nextActions: nextActions.slice(0, 4),
    clickBudgets: COCKPIT_CLICK_BUDGETS,
    prepScanSeconds: COCKPIT_PREP_SCAN_SECONDS
  };
}
