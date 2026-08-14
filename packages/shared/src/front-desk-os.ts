/**
 * Front Desk OS — receptionist operating board (Prompt 34).
 * One unified surface: every lane item has an obvious next action.
 * Goal: fewer calls, fewer re-keys, fewer conflicts / no-shows.
 */

import type { NextAction, NextActionUrgency, OpsAppointment, OpsOverdue, OpsThread } from "./next-action";
import { buildReceptionActions } from "./next-action";

/** Measured click/action budgets for common desk workflows (primary path). */
export const DESK_CLICK_BUDGETS = {
  /** Check in from the board (one button). */
  checkIn: 1,
  /** Confirm attendance without arrival (one button). */
  confirmVisit: 1,
  /** Mark no-show / missed from the board. */
  markMissed: 1,
  /** Open inbox to reply (one link). */
  openInbox: 1,
  /** Jump to calendar to pick a new slot. */
  openReschedule: 1,
  /** Open patient chart to complete intake / PHN. */
  openPatientChart: 1,
  /** Filter calendar by provider. */
  openProviderCalendar: 1
} as const;

export type DeskWorkflowId = keyof typeof DESK_CLICK_BUDGETS;

export function measureDeskWorkflowClicks(workflow: DeskWorkflowId): number {
  return DESK_CLICK_BUDGETS[workflow];
}

export type DeskLaneId =
  | "arrivals"
  | "waiting"
  | "incomplete_intake"
  | "reschedule"
  | "cancellations"
  | "communications"
  | "admin_tasks"
  | "referrals"
  | "providers";

export type DeskInlineAction = "check_in" | "confirm" | "mark_missed";

export type DeskItem = {
  id: string;
  lane: DeskLaneId;
  title: string;
  detail: string;
  urgency: NextActionUrgency;
  /** Human label for the primary control. */
  primaryLabel: string;
  /** Navigate here when primary is a link (no inline mutation). */
  href?: string;
  /** Board mutation when primary is inline (1-click). */
  inlineAction?: DeskInlineAction;
  appointmentId?: string;
  profileId?: string | null;
  /** Declared click budget for this next action. */
  clicks: number;
};

export type DeskLane = {
  id: DeskLaneId;
  label: string;
  /** Why this lane exists (friction it removes). */
  purpose: string;
  items: DeskItem[];
};

export type OpsDoctor = {
  id: string;
  firstName: string;
  lastName: string;
};

export type OpsProfileGap = {
  id: string;
  firstName: string;
  lastName: string;
  /** Field labels missing for safe desk workflows. */
  missingFields: string[];
};

export type FrontDeskBoardInput = {
  todayAppointments: OpsAppointment[];
  threads: OpsThread[];
  overdue: OpsOverdue[];
  doctors?: OpsDoctor[];
  profileGaps?: OpsProfileGap[];
  now?: Date;
};

export type FrontDeskBoard = {
  lanes: DeskLane[];
  /** Flat priority list (compat with NextAction consumers). */
  nextActions: NextAction[];
  summary: {
    todayActive: number;
    arrivals: number;
    waiting: number;
    openComms: number;
    needsAction: number;
  };
  clickBudgets: typeof DESK_CLICK_BUDGETS;
};

const ACTIVE = new Set(["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"]);

function isArrivalWindow(scheduledAt: string, now: Date): boolean {
  const start = new Date(scheduledAt).getTime();
  const t = now.getTime();
  // 45 min before → 90 min after start
  return t >= start - 45 * 60_000 && t <= start + 90 * 60_000;
}

function isPastStart(scheduledAt: string, now: Date, graceMin = 20): boolean {
  return now.getTime() > new Date(scheduledAt).getTime() + graceMin * 60_000;
}

function referralish(subject: string): boolean {
  return /referr/i.test(subject);
}

function insuranceish(subject: string): boolean {
  return /insurance|phn|coverage|billing|claim/i.test(subject);
}

/**
 * Build the unified Front Desk OS board from live clinic signals.
 * Honest gaps: no separate insurance/referral SoR — surface message + profile proxies.
 */
export function buildFrontDeskBoard(input: FrontDeskBoardInput): FrontDeskBoard {
  const now = input.now ?? new Date();
  const appts = input.todayAppointments;
  const nextActions = buildReceptionActions({
    todayAppointments: appts,
    threads: input.threads,
    overdue: input.overdue,
    now
  });

  const arrivals: DeskItem[] = [];
  const waiting: DeskItem[] = [];
  const reschedule: DeskItem[] = [];
  const cancellations: DeskItem[] = [];
  const adminTasks: DeskItem[] = [];

  for (const a of [...appts].sort(
    (x, y) => new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime()
  )) {
    const name = a.patientName ?? "Patient";
    const when = new Date(a.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const reason = a.reason ?? a.category?.replace(/_/g, " ") ?? "Visit";
    const doctor = a.doctorName ? ` · ${a.doctorName}` : "";

    if (a.status === "CANCELLED") {
      cancellations.push({
        id: `cancel-${a.id}`,
        lane: "cancellations",
        title: `${when} · ${name}`,
        detail: `${reason}${doctor} — slot may be reusable`,
        urgency: "normal",
        primaryLabel: "Offer slot",
        href: a.doctorId ? `/calendar?doctorId=${encodeURIComponent(a.doctorId)}` : "/calendar",
        appointmentId: a.id,
        clicks: DESK_CLICK_BUDGETS.openProviderCalendar
      });
      continue;
    }

    if (a.status === "RESCHEDULE_REQUESTED") {
      reschedule.push({
        id: `resched-${a.id}`,
        lane: "reschedule",
        title: `${name} needs a new time`,
        detail: `${when} · ${reason}${doctor}`,
        urgency: "high",
        primaryLabel: "Find slot",
        href: `/calendar?appointmentId=${encodeURIComponent(a.id)}`,
        appointmentId: a.id,
        profileId: a.profileId,
        clicks: DESK_CLICK_BUDGETS.openReschedule
      });
      continue;
    }

    if (a.checkedInAt && !["COMPLETED", "MISSED"].includes(a.status)) {
      waiting.push({
        id: `wait-${a.id}`,
        lane: "waiting",
        title: `${name} waiting`,
        detail: `Checked in · ${reason}${doctor}`,
        urgency: "normal",
        primaryLabel: "Open chart",
        href: a.profileId ? `/patients/${a.profileId}` : "/patients",
        appointmentId: a.id,
        profileId: a.profileId,
        clicks: DESK_CLICK_BUDGETS.openPatientChart
      });
      continue;
    }

    if (
      ACTIVE.has(a.status) &&
      !a.checkedInAt &&
      (isArrivalWindow(a.scheduledAt, now) || a.status === "SCHEDULED")
    ) {
      const late = isPastStart(a.scheduledAt, now);
      if (late && a.status === "SCHEDULED") {
        adminTasks.push({
          id: `noshow-${a.id}`,
          lane: "admin_tasks",
          title: `Possible no-show: ${name}`,
          detail: `${when} · still unconfirmed / not arrived`,
          urgency: "high",
          primaryLabel: "Mark missed",
          inlineAction: "mark_missed",
          appointmentId: a.id,
          clicks: DESK_CLICK_BUDGETS.markMissed
        });
      }

      if (isArrivalWindow(a.scheduledAt, now) || late) {
        arrivals.push({
          id: `arrive-${a.id}`,
          lane: "arrivals",
          title: `${when} · ${name}`,
          detail: `${reason}${doctor}${a.status === "SCHEDULED" ? " · not confirmed" : ""}`,
          urgency: late ? "high" : "normal",
          primaryLabel: "Check in",
          inlineAction: "check_in",
          appointmentId: a.id,
          profileId: a.profileId,
          clicks: DESK_CLICK_BUDGETS.checkIn
        });
      } else if (a.status === "SCHEDULED") {
        arrivals.push({
          id: `confirm-${a.id}`,
          lane: "arrivals",
          title: `Confirm ${name}`,
          detail: `${when} · ${reason}${doctor}`,
          urgency: "normal",
          primaryLabel: "Confirm",
          inlineAction: "confirm",
          appointmentId: a.id,
          profileId: a.profileId,
          clicks: DESK_CLICK_BUDGETS.confirmVisit
        });
      }
    }

    if (!a.doctorId && ACTIVE.has(a.status)) {
      adminTasks.push({
        id: `unassigned-${a.id}`,
        lane: "admin_tasks",
        title: `Unassigned provider: ${name}`,
        detail: `${when} · assign clinician to avoid conflicts`,
        urgency: "high",
        primaryLabel: "Assign on calendar",
        href: `/calendar?appointmentId=${encodeURIComponent(a.id)}`,
        appointmentId: a.id,
        clicks: DESK_CLICK_BUDGETS.openReschedule
      });
    }
  }

  const incomplete: DeskItem[] = (input.profileGaps ?? [])
    .filter((p) => p.missingFields.length > 0)
    .slice(0, 8)
    .map((p) => ({
      id: `intake-${p.id}`,
      lane: "incomplete_intake" as const,
      title: `${p.firstName} ${p.lastName}`,
      detail: `Missing: ${p.missingFields.join(", ")} — avoid re-asking at the window`,
      urgency: "normal" as const,
      primaryLabel: "Complete chart",
      href: `/patients/${p.id}`,
      profileId: p.id,
      clicks: DESK_CLICK_BUDGETS.openPatientChart
    }));

  // Soft intake signal: today's visits with no reason/notes
  for (const a of appts) {
    if (!ACTIVE.has(a.status)) continue;
    if (a.reason?.trim()) continue;
    if (incomplete.some((i) => i.appointmentId === a.id || i.profileId === a.profileId)) continue;
    incomplete.push({
      id: `reason-${a.id}`,
      lane: "incomplete_intake",
      title: `${a.patientName ?? "Patient"} — visit reason blank`,
      detail: "Add reason once so clinicians and desk don’t re-ask",
      urgency: "low",
      primaryLabel: "Open chart",
      href: a.profileId ? `/patients/${a.profileId}` : "/calendar",
      appointmentId: a.id,
      profileId: a.profileId,
      clicks: DESK_CLICK_BUDGETS.openPatientChart
    });
  }

  const pendingThreads = input.threads.filter((t) => t.status === "PENDING" || t.status === "UNREAD");
  const communications: DeskItem[] = pendingThreads.slice(0, 10).map((t) => ({
    id: `msg-${t.id}`,
    lane: "communications" as const,
    title: t.subject,
    detail: t.patientName ? `From ${t.patientName}` : "Clinic inbox",
    urgency: (pendingThreads.length > 5 ? "high" : "normal") as NextActionUrgency,
    primaryLabel: "Reply",
    href: `/messages?threadId=${encodeURIComponent(t.id)}`,
    clicks: DESK_CLICK_BUDGETS.openInbox
  }));

  const referralThreads = input.threads.filter((t) => referralish(t.subject));
  const referrals: DeskItem[] =
    referralThreads.length > 0
      ? referralThreads.slice(0, 5).map((t) => ({
          id: `ref-${t.id}`,
          lane: "referrals" as const,
          title: t.subject,
          detail: t.patientName ? t.patientName : "Referral follow-up via Messages",
          urgency: "normal" as const,
          primaryLabel: "Open thread",
          href: `/messages?threadId=${encodeURIComponent(t.id)}`,
          clicks: DESK_CLICK_BUDGETS.openInbox
        }))
      : [
          {
            id: "ref-empty",
            lane: "referrals",
            title: "No referral tracker in HealthFlow yet",
            detail: "Use Messages for referral status — we don’t invent a second system of record",
            urgency: "low",
            primaryLabel: "Open messages",
            href: "/messages",
            clicks: DESK_CLICK_BUDGETS.openInbox
          }
        ];

  for (const t of pendingThreads.filter((x) => insuranceish(x.subject)).slice(0, 3)) {
    adminTasks.push({
      id: `ins-${t.id}`,
      lane: "admin_tasks",
      title: `Coverage / admin: ${t.subject}`,
      detail: "Insurance questions stay in Messages until a payer integration exists",
      urgency: "normal",
      primaryLabel: "Reply",
      href: `/messages?threadId=${encodeURIComponent(t.id)}`,
      clicks: DESK_CLICK_BUDGETS.openInbox
    });
  }

  for (const o of input.overdue.slice(0, 5)) {
    adminTasks.push({
      id: `od-${o.id}`,
      lane: "admin_tasks",
      title: `Overdue checkup: ${o.firstName} ${o.lastName}`,
      detail: `${o.daysOverdue} days past window — outreach beats a cold call later`,
      urgency: o.daysOverdue > 90 ? "high" : "low",
      primaryLabel: "Open list",
      href: "/overdue-checkups",
      profileId: o.id,
      clicks: DESK_CLICK_BUDGETS.openPatientChart
    });
  }

  const providers: DeskItem[] = (input.doctors ?? []).map((d) => {
    const load = appts.filter(
      (a) => a.doctorId === d.id && ACTIVE.has(a.status) && a.status !== "CANCELLED"
    );
    return {
      id: `doc-${d.id}`,
      lane: "providers" as const,
      title: `Dr. ${d.lastName}`,
      detail:
        load.length === 0
          ? "No visits booked today — available for walk-ins / reschedules"
          : `${load.length} visit${load.length === 1 ? "" : "s"} today`,
      urgency: "low" as const,
      primaryLabel: "Open schedule",
      href: `/calendar?doctorId=${encodeURIComponent(d.id)}`,
      clicks: DESK_CLICK_BUDGETS.openProviderCalendar
    };
  });

  const lanes: DeskLane[] = [
    {
      id: "arrivals",
      label: "Arrivals & confirmations",
      purpose: "Cut waiting and no-shows — confirm early, check in in one tap",
      items: arrivals
    },
    {
      id: "waiting",
      label: "Waiting",
      purpose: "Who is already here",
      items: waiting
    },
    {
      id: "incomplete_intake",
      label: "Incomplete intake",
      purpose: "Capture missing fields once — stop repetitive questions",
      items: incomplete
    },
    {
      id: "reschedule",
      label: "Rescheduling",
      purpose: "Clear requests before they become phone tag",
      items: reschedule
    },
    {
      id: "cancellations",
      label: "Cancellations today",
      purpose: "Reuse freed slots; reduce schedule holes",
      items: cancellations
    },
    {
      id: "communications",
      label: "Communication requests",
      purpose: "Answer in-portal instead of taking another call",
      items: communications
    },
    {
      id: "admin_tasks",
      label: "Administrative tasks",
      purpose: "No-shows, unassigned visits, overdue outreach, coverage questions",
      items: adminTasks
    },
    {
      id: "referrals",
      label: "Referral status",
      purpose: "Track via Messages until a referral SoR exists",
      items: referrals
    },
    {
      id: "providers",
      label: "Provider availability",
      purpose: "See load before booking — conflicts blocked by the API",
      items: providers
    }
  ];

  const todayActive = appts.filter((a) => ACTIVE.has(a.status)).length;
  const openComms = communications.length;
  const needsAction =
    arrivals.length +
    reschedule.length +
    incomplete.length +
    openComms +
    adminTasks.filter((i) => i.urgency === "high" || i.urgency === "critical").length;

  return {
    lanes,
    nextActions,
    summary: {
      todayActive,
      arrivals: arrivals.length,
      waiting: waiting.length,
      openComms,
      needsAction
    },
    clickBudgets: DESK_CLICK_BUDGETS
  };
}

/** Derive profile gaps from appointment-embedded profile snippets. */
export function profileGapsFromAppointments(
  appointments: Array<{
    profile?: {
      id: string;
      firstName: string;
      lastName: string;
      phone?: string | null;
      healthcareNumber?: string | null;
      dateOfBirth?: string | null;
      email?: string | null;
    } | null;
  }>
): OpsProfileGap[] {
  const map = new Map<string, OpsProfileGap>();
  for (const a of appointments) {
    const p = a.profile;
    if (!p?.id) continue;
    const missing: string[] = [];
    if (!p.phone?.trim()) missing.push("phone");
    if (!p.healthcareNumber?.trim()) missing.push("healthcare number");
    if (!p.dateOfBirth) missing.push("date of birth");
    if (missing.length === 0) continue;
    if (!map.has(p.id)) {
      map.set(p.id, {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        missingFields: missing
      });
    }
  }
  return [...map.values()];
}
