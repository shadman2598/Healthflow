/**
 * Patient continuous-care journey resolver (shared, pure).
 * Goal: minimum cognitive effort to complete the next healthcare task.
 */

export type JourneyAppointment = {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  category?: string;
  checkedInAt?: string | null;
  doctor?: { firstName: string | null; lastName: string | null } | null;
};

export type JourneyThread = {
  id: string;
  status: string;
};

export type JourneyContext = {
  isGuest: boolean;
  appointments: JourneyAppointment[];
  threads: JourneyThread[];
  /** Optional prep completion 0–1 for the next visit (from client storage). */
  prepProgress?: number | null;
  now?: Date;
};

export type JourneyStepId =
  | "guest_sign_in"
  | "confirm_visit"
  | "prep_visit"
  | "day_of_arrive"
  | "checked_in"
  | "awaiting_reschedule"
  | "open_messages"
  | "request_visit"
  | "follow_up"
  | "all_clear";

/** Longitudinal continuum — Rx/results are clinic-led (no fake patient SoR). */
export type JourneyPhaseId =
  | "discover"
  | "register"
  | "appoint"
  | "intake"
  | "arrive"
  | "encounter"
  | "after"
  | "remind";

export type JourneyPhase = {
  id: JourneyPhaseId;
  label: string;
  state: "done" | "current" | "upcoming" | "clinic";
};

export type JourneyStep = {
  id: JourneyStepId;
  eyebrow: string;
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string }[];
  appointment?: JourneyAppointment | null;
  /** Continuum phases for progressive disclosure UI. */
  phases: JourneyPhase[];
};

const ACTIVE = new Set(["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"]);

export const VISIT_REQUEST_DRAFT_PATH =
  "/messages?draft=" +
  encodeURIComponent(
    "I'd like to request an appointment.\n\nPreferred timing:\nReason for visit:\n"
  );

export function confirmVisitHref(appointmentId: string): string {
  return `/patient/appointments?action=confirm&id=${encodeURIComponent(appointmentId)}`;
}

export function prepVisitHref(appointmentId?: string): string {
  const base = "/patient/care-guide?tab=prep";
  return appointmentId ? `${base}&appointmentId=${encodeURIComponent(appointmentId)}` : base;
}

export function pickNextVisit(
  appointments: JourneyAppointment[],
  now = new Date()
): JourneyAppointment | null {
  const upcoming = appointments
    .filter((a) => ACTIVE.has(a.status) && new Date(a.scheduledAt).getTime() >= now.getTime() - 60_000)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return upcoming[0] ?? null;
}

export function pickRecentCompleted(
  appointments: JourneyAppointment[],
  now = new Date(),
  withinDays = 14
): JourneyAppointment | null {
  const cutoff = now.getTime() - withinDays * 24 * 60 * 60 * 1000;
  const done = appointments
    .filter((a) => a.status === "COMPLETED" && new Date(a.scheduledAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  return done[0] ?? null;
}

export function countAttentionThreads(threads: JourneyThread[]): number {
  return threads.filter((t) => t.status === "UNREAD" || t.status === "PENDING").length;
}

/** True when the visit is “today’s arrival window” (3h before → 2h after start). */
export function isDayOfArrivalWindow(scheduledAt: string, now = new Date()): boolean {
  const start = new Date(scheduledAt).getTime();
  const t = now.getTime();
  return t >= start - 3 * 3600_000 && t <= start + 2 * 3600_000;
}

function phaseStates(
  current: JourneyPhaseId,
  opts?: { registered?: boolean }
): JourneyPhase[] {
  const order: { id: JourneyPhaseId; label: string; clinic?: boolean }[] = [
    { id: "discover", label: "Discover" },
    { id: "register", label: "Register" },
    { id: "appoint", label: "Visit" },
    { id: "intake", label: "Prep" },
    { id: "arrive", label: "Arrive" },
    { id: "encounter", label: "Visit day", clinic: true },
    { id: "after", label: "After" },
    { id: "remind", label: "Remind" }
  ];
  const idx = order.findIndex((p) => p.id === current);
  return order.map((p, i) => {
    if (p.id === current) return { id: p.id, label: p.label, state: "current" as const };
    if (p.clinic) return { id: p.id, label: p.label, state: "clinic" as const };
    if (opts?.registered && (p.id === "discover" || p.id === "register") && i < idx) {
      return { id: p.id, label: p.label, state: "done" as const };
    }
    if (i < idx) return { id: p.id, label: p.label, state: "done" as const };
    return { id: p.id, label: p.label, state: "upcoming" as const };
  });
}

function withPhases(
  step: Omit<JourneyStep, "phases">,
  current: JourneyPhaseId,
  registered: boolean
): JourneyStep {
  return {
    ...step,
    secondary: (step.secondary ?? []).slice(0, 2),
    phases: phaseStates(current, { registered })
  };
}

export function resolvePatientNextStep(ctx: JourneyContext): JourneyStep {
  const now = ctx.now ?? new Date();
  const registered = !ctx.isGuest;

  if (ctx.isGuest) {
    return withPhases(
      {
        id: "guest_sign_in",
        eyebrow: "Your next step",
        title: "Sign in to manage your care",
        body: "Explore as a guest, then sign in once to confirm visits, message the clinic, and save reminder preferences — no need to re-enter the same details later.",
        primary: { label: "Patient sign in", href: "/login/patient" },
        secondary: [
          { label: "Create account", href: "/signup/patient" },
          { label: "Care Guide", href: "/patient/care-guide" }
        ]
      },
      "register",
      false
    );
  }

  const next = pickNextVisit(ctx.appointments, now);
  const attention = countAttentionThreads(ctx.threads);

  if (next?.status === "SCHEDULED") {
    return withPhases(
      {
        id: "confirm_visit",
        eyebrow: "Your next step",
        title: "Confirm your upcoming visit",
        body: "One tap tells the clinic you plan to attend. You can still change or cancel afterward.",
        primary: { label: "Confirm visit", href: confirmVisitHref(next.id) },
        secondary: [
          { label: "Prep checklist", href: prepVisitHref(next.id) },
          { label: "Message clinic", href: "/messages" }
        ],
        appointment: next
      },
      "appoint",
      registered
    );
  }

  if (next?.status === "RESCHEDULE_REQUESTED") {
    return withPhases(
      {
        id: "awaiting_reschedule",
        eyebrow: "Waiting on clinic",
        title: "Reschedule request sent",
        body: "Reception will follow up with a new time. You don’t need to call unless your availability changed.",
        primary: { label: "Open messages", href: "/messages" },
        secondary: [{ label: "View appointment", href: "/patient/appointments" }],
        appointment: next
      },
      "appoint",
      registered
    );
  }

  if (next?.status === "CONFIRMED" && next.checkedInAt) {
    return withPhases(
      {
        id: "checked_in",
        eyebrow: "You're here",
        title: "Checked in — please wait for your clinician",
        body: "The front desk has you on the board. Prescriptions, orders, and results (if any) are handled by the clinic after your visit — watch Messages for follow-up.",
        primary: { label: "Open messages", href: "/messages" },
        secondary: [{ label: "View visit", href: "/patient/appointments" }],
        appointment: next
      },
      "encounter",
      registered
    );
  }

  if (next?.status === "CONFIRMED" && isDayOfArrivalWindow(next.scheduledAt, now)) {
    return withPhases(
      {
        id: "day_of_arrive",
        eyebrow: "Today's visit",
        title: "Check in at the front desk when you arrive",
        body: "You’re confirmed for today. Reception will check you in — no extra forms needed if your profile is up to date.",
        primary: { label: "View visit details", href: "/patient/appointments" },
        secondary: [
          { label: "Message clinic", href: "/messages" },
          { label: "Quick prep", href: prepVisitHref(next.id) }
        ],
        appointment: next
      },
      "arrive",
      registered
    );
  }

  if (next && next.status === "CONFIRMED") {
    const prepDone = (ctx.prepProgress ?? 0) >= 0.8;
    return withPhases(
      {
        id: "prep_visit",
        eyebrow: "Your next step",
        title: prepDone ? "You're prepared — set a reminder if you like" : "Prepare for your visit",
        body: prepDone
          ? "Checklist looks complete. Optional: confirm reminder preferences so you aren’t interrupted outside quiet hours."
          : "A short checklist for this visit type. Answer once — we won’t ask again for the same visit.",
        primary: prepDone
          ? { label: "Reminder settings", href: "/patient/reminders" }
          : { label: "Open visit prep", href: prepVisitHref(next.id) },
        secondary: prepDone
          ? [
              { label: "Review checklist", href: prepVisitHref(next.id) },
              { label: "Manage appointment", href: "/patient/appointments" }
            ]
          : [
              { label: "Manage appointment", href: "/patient/appointments" },
              { label: "Reminders", href: "/patient/reminders" }
            ],
        appointment: next
      },
      "intake",
      registered
    );
  }

  if (attention > 0) {
    return withPhases(
      {
        id: "open_messages",
        eyebrow: "Your next step",
        title: attention === 1 ? "You have a message waiting" : `You have ${attention} messages waiting`,
        body: "Clinic updates about scheduling, forms, or instructions land here — open once and you’re done.",
        primary: { label: "Open messages", href: "/messages" },
        secondary: [{ label: "Care Guide", href: "/patient/care-guide" }]
      },
      "after",
      registered
    );
  }

  if (!next) {
    const recent = pickRecentCompleted(ctx.appointments, now);
    if (recent) {
      return withPhases(
        {
          id: "follow_up",
          eyebrow: "After your visit",
          title: "Need a follow-up or clarification?",
          body: "Bloodwork, referrals, and prescriptions are managed by the clinic. Message reception if something is missing, or request another visit.",
          primary: { label: "Message clinic", href: "/messages" },
          secondary: [
            { label: "Request another visit", href: VISIT_REQUEST_DRAFT_PATH },
            { label: "Care Guide", href: "/patient/care-guide" }
          ],
          appointment: recent
        },
        "after",
        registered
      );
    }

    return withPhases(
      {
        id: "request_visit",
        eyebrow: "Your next step",
        title: "No upcoming visit on your calendar",
        body: "Message the clinic once with preferred timing and reason. Reception will confirm — online self-booking isn’t available yet.",
        primary: { label: "Request a visit", href: VISIT_REQUEST_DRAFT_PATH },
        secondary: [
          { label: "Care Guide", href: "/patient/care-guide" },
          { label: "Fees & resources", href: "/resources" }
        ]
      },
      "appoint",
      registered
    );
  }

  return withPhases(
    {
      id: "all_clear",
      eyebrow: "You're set",
      title: "Nothing urgent right now",
      body: "Your next visit is on the calendar. Adjust reminders anytime so we only nudge you when it’s useful.",
      primary: { label: "View calendar", href: "/calendar" },
      secondary: [
        { label: "Reminders", href: "/patient/reminders" },
        { label: "Messages", href: "/messages" }
      ],
      appointment: next
    },
    "remind",
    registered
  );
}
