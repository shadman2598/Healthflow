/**
 * Patient continuous-care journey resolver (shared, pure).
 */

export type JourneyAppointment = {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  category?: string;
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
  now?: Date;
};

export type JourneyStepId =
  | "guest_sign_in"
  | "confirm_visit"
  | "prep_visit"
  | "awaiting_reschedule"
  | "open_messages"
  | "request_visit"
  | "follow_up"
  | "all_clear";

export type JourneyStep = {
  id: JourneyStepId;
  eyebrow: string;
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string }[];
  appointment?: JourneyAppointment | null;
};

const ACTIVE = new Set(["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"]);

export const VISIT_REQUEST_DRAFT_PATH =
  "/messages?draft=" +
  encodeURIComponent(
    "I'd like to request an appointment.\n\nPreferred timing:\nReason for visit:\n"
  );

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

export function resolvePatientNextStep(ctx: JourneyContext): JourneyStep {
  const now = ctx.now ?? new Date();

  if (ctx.isGuest) {
    return {
      id: "guest_sign_in",
      eyebrow: "Your next step",
      title: "Sign in to manage your care",
      body: "Guest mode lets you explore. Sign in or create an account to confirm visits, message the clinic, and save reminder preferences.",
      primary: { label: "Patient sign in", href: "/login/patient" },
      secondary: [
        { label: "Create account", href: "/signup/patient" },
        { label: "Care Guide", href: "/patient/care-guide" }
      ]
    };
  }

  const next = pickNextVisit(ctx.appointments, now);
  const attention = countAttentionThreads(ctx.threads);

  if (next?.status === "SCHEDULED") {
    return {
      id: "confirm_visit",
      eyebrow: "Your next step",
      title: "Confirm your upcoming visit",
      body: "Let the clinic know you plan to attend. You can also prep questions or request a change.",
      primary: { label: "Confirm visit", href: "/patient/appointments" },
      secondary: [
        { label: "Prep for visit", href: "/patient/care-guide?tab=prep" },
        { label: "Message clinic", href: "/messages" }
      ],
      appointment: next
    };
  }

  if (next?.status === "RESCHEDULE_REQUESTED") {
    return {
      id: "awaiting_reschedule",
      eyebrow: "Waiting on clinic",
      title: "Reschedule request sent",
      body: "Reception will follow up with a new time. Message them if your availability changed.",
      primary: { label: "Open messages", href: "/messages" },
      secondary: [
        { label: "View appointment", href: "/patient/appointments" },
        { label: "Reminder settings", href: "/patient/reminders" }
      ],
      appointment: next
    };
  }

  if (next && next.status === "CONFIRMED") {
    return {
      id: "prep_visit",
      eyebrow: "Your next step",
      title: "Prepare for your visit",
      body: "Review the prep checklist, set reminder preferences, and message the clinic with questions before you arrive.",
      primary: { label: "Open visit prep", href: "/patient/care-guide?tab=prep" },
      secondary: [
        { label: "Manage appointment", href: "/patient/appointments" },
        { label: "Reminder settings", href: "/patient/reminders" }
      ],
      appointment: next
    };
  }

  if (attention > 0) {
    return {
      id: "open_messages",
      eyebrow: "Your next step",
      title: attention === 1 ? "You have a message waiting" : `You have ${attention} messages waiting`,
      body: "Check your clinic inbox for updates about scheduling, forms, or care instructions.",
      primary: { label: "Open messages", href: "/messages" },
      secondary: [
        { label: "Care Guide", href: "/patient/care-guide" },
        { label: "View calendar", href: "/calendar" }
      ]
    };
  }

  if (!next) {
    const recent = pickRecentCompleted(ctx.appointments, now);
    if (recent) {
      return {
        id: "follow_up",
        eyebrow: "After your visit",
        title: "Need a follow-up or clarification?",
        body: "If the clinic asked for bloodwork, a specialist visit, or a check-in, message reception or use Care Guide to decide what to do next.",
        primary: { label: "Message clinic", href: "/messages" },
        secondary: [
          { label: "Care Guide", href: "/patient/care-guide" },
          { label: "Request another visit", href: VISIT_REQUEST_DRAFT_PATH }
        ],
        appointment: recent
      };
    }

    return {
      id: "request_visit",
      eyebrow: "Your next step",
      title: "No upcoming visit on your calendar",
      body: "Request an appointment by messaging the clinic. Online self-booking is not available yet — reception will confirm a time.",
      primary: { label: "Request a visit", href: VISIT_REQUEST_DRAFT_PATH },
      secondary: [
        { label: "Care Guide", href: "/patient/care-guide" },
        { label: "Fees & resources", href: "/resources" }
      ]
    };
  }

  return {
    id: "all_clear",
    eyebrow: "You're set",
    title: "Nothing urgent right now",
    body: "Your next visit is on the calendar. You can still message the clinic or adjust reminders anytime.",
    primary: { label: "View calendar", href: "/calendar" },
    secondary: [
      { label: "Messages", href: "/messages" },
      { label: "Reminders", href: "/patient/reminders" }
    ],
    appointment: next
  };
}
