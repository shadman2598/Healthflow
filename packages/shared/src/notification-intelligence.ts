/**
 * Notification intelligence (Prompt 39).
 * Usefulness over volume — do not notify merely because an event occurred.
 */

export type NotificationKind =
  | "appointment_reminder"
  | "intake_reminder"
  | "medication_reminder"
  | "result_notification"
  | "follow_up_reminder"
  | "administrative_request"
  | "clinician_message";

export type NotificationUrgency = "critical" | "high" | "normal" | "low";

export type NotificationChannel = "EMAIL" | "SMS" | "IN_APP";

export type NotificationEngagement =
  | "delivered"
  | "opened"
  | "acted_upon"
  | "ignored"
  | "dismissed";

export type NotificationDecision =
  | {
      send: true;
      kind: NotificationKind;
      urgency: NotificationUrgency;
      requiresAction: boolean;
      channels: NotificationChannel[];
      locale: string;
      title: string;
      body: string;
      actionHref?: string;
      actionLabel?: string;
      escalateAfterMinutes?: number;
      retryMax: number;
      reason: string;
    }
  | {
      send: false;
      kind: NotificationKind;
      reason: string;
      code:
        | "OPT_OUT"
        | "QUIET_HOURS"
        | "NO_ACTION_NEEDED"
        | "CHANNEL_DISABLED"
        | "LOW_RELEVANCE"
        | "EXTERNAL_SOR"
        | "DUPLICATE"
        | "TOO_SOON";
    };

export type UserNotificationPrefs = {
  email: boolean;
  sms: boolean;
  inApp: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  /** Hard opt-out of non-critical outreach. */
  optOut?: boolean;
  /** Prefer only notifications that require a patient action. */
  actionOnly?: boolean;
  locale?: string;
};

export type EngagementStats = {
  delivered: number;
  opened: number;
  actedUpon: number;
  ignored: number;
  dismissed: number;
};

export type NotificationCandidate = {
  kind: NotificationKind;
  /** Domain event that triggered consideration — not automatic send. */
  triggerEvent: string;
  urgency?: NotificationUrgency;
  requiresAction: boolean;
  /** ISO time of the related clinical/admin deadline (appointment, etc.). */
  actionableAt?: string | Date | null;
  sourceType?: string;
  sourceId?: string;
  patientName?: string;
  visitWhen?: string;
  messageSubject?: string;
  /** True when content lives in EHR/LIS — HealthFlow should not invent payloads. */
  externalClinical?: boolean;
  alreadyNotifiedRecently?: boolean;
  prefs: UserNotificationPrefs;
  engagement?: EngagementStats;
  now?: Date;
};

const DEFAULT_LOCALE = "en-CA";

const COPY: Record<
  string,
  Record<
    NotificationKind,
    { title: string; body: (ctx: NotificationCandidate) => string; actionLabel?: string }
  >
> = {
  "en-CA": {
    appointment_reminder: {
      title: "Upcoming visit reminder",
      body: (c) =>
        c.visitWhen
          ? `Please confirm you can attend your visit on ${c.visitWhen}.`
          : "Please confirm you can attend your upcoming visit.",
      actionLabel: "Confirm visit"
    },
    intake_reminder: {
      title: "Complete visit prep",
      body: () => "A short checklist will save time at the clinic — finish it before you arrive.",
      actionLabel: "Open prep"
    },
    medication_reminder: {
      title: "Medication reminder",
      body: () => "Take your medication as prescribed. Contact the clinic if you have questions.",
      actionLabel: "Mark taken"
    },
    result_notification: {
      title: "Results ready to review",
      body: () => "Your clinic has results that need your attention — open the message from your care team.",
      actionLabel: "Open message"
    },
    follow_up_reminder: {
      title: "Follow-up needed",
      body: () => "Your care team asked for a follow-up step. One action keeps your plan on track.",
      actionLabel: "Continue"
    },
    administrative_request: {
      title: "Clinic request",
      body: (c) => c.messageSubject ?? "The clinic needs a response from you.",
      actionLabel: "Respond"
    },
    clinician_message: {
      title: "Message from your clinician",
      body: (c) => c.messageSubject ?? "You have a clinic message waiting.",
      actionLabel: "Open inbox"
    }
  },
  fr_CA: {
    appointment_reminder: {
      title: "Rappel de rendez-vous",
      body: (c) =>
        c.visitWhen
          ? `Veuillez confirmer votre présence le ${c.visitWhen}.`
          : "Veuillez confirmer votre prochain rendez-vous.",
      actionLabel: "Confirmer"
    },
    intake_reminder: {
      title: "Préparer votre visite",
      body: () => "Une courte liste de préparation accélère votre visite.",
      actionLabel: "Ouvrir"
    },
    medication_reminder: {
      title: "Rappel de médicament",
      body: () => "Prenez votre médicament comme prescrit.",
      actionLabel: "Confirmé"
    },
    result_notification: {
      title: "Résultats à consulter",
      body: () => "Des résultats nécessitent votre attention.",
      actionLabel: "Ouvrir"
    },
    follow_up_reminder: {
      title: "Suivi requis",
      body: () => "Une étape de suivi est demandée.",
      actionLabel: "Continuer"
    },
    administrative_request: {
      title: "Demande de la clinique",
      body: (c) => c.messageSubject ?? "La clinique attend une réponse.",
      actionLabel: "Répondre"
    },
    clinician_message: {
      title: "Message du clinicien",
      body: (c) => c.messageSubject ?? "Vous avez un message.",
      actionLabel: "Boîte de réception"
    }
  }
};

export function isInsideQuietHours(
  now: Date,
  quietHoursStart: number | null | undefined,
  quietHoursEnd: number | null | undefined
): boolean {
  if (quietHoursStart == null || quietHoursEnd == null) return false;
  const hour = now.getHours();
  if (quietHoursStart === quietHoursEnd) return false;
  if (quietHoursStart < quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  return hour >= quietHoursStart || hour < quietHoursEnd;
}

export function resolveLocale(locale?: string | null): string {
  if (!locale) return DEFAULT_LOCALE;
  if (locale.startsWith("fr")) return "fr_CA";
  return "en-CA";
}

export function engagementRelevanceScore(stats?: EngagementStats): number {
  if (!stats) return 0.5;
  const total =
    stats.delivered + stats.opened + stats.actedUpon + stats.ignored + stats.dismissed;
  if (total === 0) return 0.5;
  const positive = stats.actedUpon * 2 + stats.opened;
  const negative = stats.ignored + stats.dismissed * 1.5;
  const raw = (positive - negative) / Math.max(1, total);
  return Math.max(0, Math.min(1, 0.5 + raw / 2));
}

function defaultUrgency(kind: NotificationKind, requiresAction: boolean): NotificationUrgency {
  if (kind === "clinician_message" && requiresAction) return "high";
  if (kind === "administrative_request") return "high";
  if (kind === "result_notification") return "high";
  if (kind === "appointment_reminder") return "normal";
  if (kind === "intake_reminder") return "normal";
  if (kind === "follow_up_reminder") return "normal";
  if (kind === "medication_reminder") return "low";
  return requiresAction ? "normal" : "low";
}

function selectChannels(
  prefs: UserNotificationPrefs,
  urgency: NotificationUrgency
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (prefs.inApp) channels.push("IN_APP");
  if (prefs.email) channels.push("EMAIL");
  if (prefs.sms && (urgency === "critical" || urgency === "high")) channels.push("SMS");
  // Critical always tries in-app even if somehow all off (still respect hard opt-out elsewhere).
  if (channels.length === 0 && urgency === "critical" && prefs.inApp !== false) {
    channels.push("IN_APP");
  }
  return channels;
}

function escalateMinutes(urgency: NotificationUrgency, requiresAction: boolean): number | undefined {
  if (!requiresAction) return undefined;
  if (urgency === "critical") return 60;
  if (urgency === "high") return 24 * 60;
  if (urgency === "normal") return 48 * 60;
  return undefined;
}

/**
 * Core gate: events propose notifications; intelligence decides whether to send.
 */
export function decideNotification(candidate: NotificationCandidate): NotificationDecision {
  const now = candidate.now ?? new Date();
  const kind = candidate.kind;
  const urgency = candidate.urgency ?? defaultUrgency(kind, candidate.requiresAction);

  if (candidate.prefs.optOut && urgency !== "critical") {
    return { send: false, kind, reason: "User opted out of non-critical notifications", code: "OPT_OUT" };
  }

  // Never invent clinical content HealthFlow does not own.
  if (
    candidate.externalClinical &&
    (kind === "medication_reminder" || kind === "result_notification")
  ) {
    if (!candidate.requiresAction || !candidate.sourceId) {
      return {
        send: false,
        kind,
        reason: "External clinical SoR — no actionable HealthFlow payload",
        code: "EXTERNAL_SOR"
      };
    }
  }

  // Do not notify merely because an event occurred.
  if (!candidate.requiresAction && urgency === "low") {
    return {
      send: false,
      kind,
      reason: "No patient action required — suppressing informational noise",
      code: "NO_ACTION_NEEDED"
    };
  }

  if (candidate.prefs.actionOnly && !candidate.requiresAction && urgency !== "critical") {
    return {
      send: false,
      kind,
      reason: "User prefers action-required notifications only",
      code: "NO_ACTION_NEEDED"
    };
  }

  if (candidate.alreadyNotifiedRecently) {
    return {
      send: false,
      kind,
      reason: "Duplicate suppressed — already notified recently for this source",
      code: "DUPLICATE"
    };
  }

  // Appointment reminders: only while the visit is upcoming and still useful to act on.
  if (kind === "appointment_reminder" && candidate.actionableAt) {
    const when = new Date(candidate.actionableAt).getTime();
    const hours = (when - now.getTime()) / 3600_000;
    if (hours < 0) {
      return {
        send: false,
        kind,
        reason: "Visit already passed — reminder no longer useful",
        code: "TOO_SOON"
      };
    }
    // Hard ceiling against far-future noise; frequency prefs handle cadence inside this window.
    if (hours > 60 * 24) {
      return {
        send: false,
        kind,
        reason: "Outside useful reminder horizon (>60 days)",
        code: "TOO_SOON"
      };
    }
  }

  const relevance = engagementRelevanceScore(candidate.engagement);
  if (relevance < 0.25 && urgency === "low") {
    return {
      send: false,
      kind,
      reason: "Low historical engagement — suppressing low-urgency ping",
      code: "LOW_RELEVANCE"
    };
  }

  const inQuiet = isInsideQuietHours(
    now,
    candidate.prefs.quietHoursStart,
    candidate.prefs.quietHoursEnd
  );
  if (inQuiet && urgency !== "critical") {
    return {
      send: false,
      kind,
      reason: "Quiet hours — defer non-critical outreach",
      code: "QUIET_HOURS"
    };
  }

  const channels = selectChannels(candidate.prefs, urgency);
  if (channels.length === 0) {
    return {
      send: false,
      kind,
      reason: "All notification channels disabled",
      code: "CHANNEL_DISABLED"
    };
  }

  const locale = resolveLocale(candidate.prefs.locale);
  const pack = COPY[locale]?.[kind] ?? COPY[DEFAULT_LOCALE][kind];
  const actionHref =
    kind === "appointment_reminder"
      ? "/patient/appointments"
      : kind === "intake_reminder"
        ? "/patient/care-guide?tab=prep"
        : kind === "clinician_message" || kind === "administrative_request" || kind === "result_notification"
          ? "/messages"
          : kind === "follow_up_reminder"
            ? "/patient/dashboard"
            : undefined;

  return {
    send: true,
    kind,
    urgency,
    requiresAction: candidate.requiresAction,
    channels,
    locale,
    title: pack.title,
    body: pack.body(candidate),
    actionHref,
    actionLabel: pack.actionLabel,
    escalateAfterMinutes: escalateMinutes(urgency, candidate.requiresAction),
    retryMax: urgency === "critical" ? 5 : urgency === "high" ? 3 : 2,
    reason: `Actionable ${kind} via ${channels.join(",")}`
  };
}

/** Escalation: if unanswered actionable notice ages out, propose a higher-urgency follow-up. */
export function proposeEscalation(input: {
  kind: NotificationKind;
  requiresAction: boolean;
  urgency: NotificationUrgency;
  deliveredAt: string | Date;
  actedAt?: string | Date | null;
  dismissedAt?: string | Date | null;
  escalateAfterMinutes?: number;
  now?: Date;
}): NotificationCandidate | null {
  if (!input.requiresAction || input.actedAt || input.dismissedAt) return null;
  if (!input.escalateAfterMinutes) return null;
  const now = input.now ?? new Date();
  const ageMin = (now.getTime() - new Date(input.deliveredAt).getTime()) / 60_000;
  if (ageMin < input.escalateAfterMinutes) return null;

  const nextUrgency: NotificationUrgency =
    input.urgency === "low" ? "normal" : input.urgency === "normal" ? "high" : "critical";

  return {
    kind: input.kind,
    triggerEvent: "escalation_unanswered",
    urgency: nextUrgency,
    requiresAction: true,
    prefs: { email: true, sms: nextUrgency === "critical", inApp: true },
    alreadyNotifiedRecently: false
  };
}

export function applyEngagementTransition(
  current: NotificationEngagement | "queued" | "suppressed" | "failed",
  next: NotificationEngagement
): { ok: boolean; next: NotificationEngagement; reason?: string } {
  const order: Record<string, number> = {
    suppressed: 0,
    queued: 1,
    failed: 1,
    delivered: 2,
    opened: 3,
    acted_upon: 4,
    ignored: 4,
    dismissed: 4
  };
  if ((order[current] ?? 0) > (order[next] ?? 0) && current !== "delivered") {
    // Allow opened → acted/dismissed/ignored; block regressions except delivered→opened.
    if (!(current === "opened" && ["acted_upon", "ignored", "dismissed"].includes(next))) {
      return { ok: false, next: current as NotificationEngagement, reason: "Invalid engagement regression" };
    }
  }
  return { ok: true, next };
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "appointment_reminder",
  "intake_reminder",
  "medication_reminder",
  "result_notification",
  "follow_up_reminder",
  "administrative_request",
  "clinician_message"
];
