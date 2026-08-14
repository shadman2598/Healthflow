import {
  decideNotification,
  proposeEscalation,
  type NotificationCandidate,
  type NotificationChannel,
  type NotificationKind,
  type UserNotificationPrefs
} from "@technovate/shared";
import {
  type NotificationEventStatus,
  type PatientProfile,
  ReminderChannel
} from "@prisma/client";
import { prisma } from "./prisma";

const KIND_TO_DB: Record<NotificationKind, string> = {
  appointment_reminder: "APPOINTMENT_REMINDER",
  intake_reminder: "INTAKE_REMINDER",
  medication_reminder: "MEDICATION_REMINDER",
  result_notification: "RESULT_NOTIFICATION",
  follow_up_reminder: "FOLLOW_UP_REMINDER",
  administrative_request: "ADMINISTRATIVE_REQUEST",
  clinician_message: "CLINICIAN_MESSAGE"
};

const DB_TO_KIND = Object.fromEntries(
  Object.entries(KIND_TO_DB).map(([k, v]) => [v, k])
) as Record<string, NotificationKind>;

const URGENCY_TO_DB = {
  critical: "CRITICAL",
  high: "HIGH",
  normal: "NORMAL",
  low: "LOW"
} as const;

export function prefsFromProfile(profile: PatientProfile | null | undefined): UserNotificationPrefs {
  if (!profile) {
    return { email: true, sms: false, inApp: true, locale: "en-CA" };
  }
  return {
    email: profile.reminderPrefEmail,
    sms: profile.reminderPrefSms,
    inApp: profile.reminderPrefApp,
    quietHoursStart: profile.quietHoursStart,
    quietHoursEnd: profile.quietHoursEnd,
    optOut: profile.notificationsOptOut,
    actionOnly: profile.notificationsActionOnly,
    locale: profile.notificationLocale
  };
}

export async function loadEngagementStats(profileId: string) {
  const rows = await prisma.notificationEvent.groupBy({
    by: ["status"],
    where: { profileId },
    _count: { _all: true }
  });
  const count = (status: NotificationEventStatus): number =>
    rows.find((r) => r.status === status)?._count._all ?? 0;
  return {
    delivered: count("DELIVERED") + count("OPENED") + count("ACTED") + count("IGNORED") + count("DISMISSED"),
    opened: count("OPENED") + count("ACTED"),
    actedUpon: count("ACTED"),
    ignored: count("IGNORED"),
    dismissed: count("DISMISSED")
  };
}

async function recentlyNotified(sourceType: string, sourceId: string, kind: NotificationKind): Promise<boolean> {
  const since = new Date(Date.now() - 12 * 3600_000);
  const hit = await prisma.notificationEvent.findFirst({
    where: {
      sourceType,
      sourceId,
      kind: KIND_TO_DB[kind] as never,
      status: { in: ["QUEUED", "DELIVERED", "OPENED", "ACTED"] },
      createdAt: { gte: since }
    }
  });
  return Boolean(hit);
}

/**
 * Decide + persist a notification. Returns null event when suppressed as a duplicate of a recent decision.
 */
export async function considerNotification(
  candidate: Omit<NotificationCandidate, "engagement" | "alreadyNotifiedRecently" | "prefs"> & {
    organizationId: string;
    profileId?: string | null;
    prefs?: UserNotificationPrefs;
    engagement?: NotificationCandidate["engagement"];
  }
) {
  let prefs = candidate.prefs;
  let engagement = candidate.engagement;
  if (candidate.profileId) {
    const profile = await prisma.patientProfile.findUnique({ where: { id: candidate.profileId } });
    prefs = prefs ?? prefsFromProfile(profile);
    engagement = engagement ?? (await loadEngagementStats(candidate.profileId));
  }
  prefs = prefs ?? { email: true, sms: false, inApp: true };

  const already =
    candidate.sourceType && candidate.sourceId
      ? await recentlyNotified(candidate.sourceType, candidate.sourceId, candidate.kind)
      : false;

  if (already) {
    return {
      decision: {
        send: false as const,
        kind: candidate.kind,
        reason: "Duplicate suppressed — already considered recently for this source",
        code: "DUPLICATE" as const
      },
      event: null
    };
  }

  const decision = decideNotification({
    kind: candidate.kind,
    triggerEvent: candidate.triggerEvent,
    urgency: candidate.urgency,
    requiresAction: candidate.requiresAction,
    actionableAt: candidate.actionableAt,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    patientName: candidate.patientName,
    visitWhen: candidate.visitWhen,
    messageSubject: candidate.messageSubject,
    externalClinical: candidate.externalClinical,
    alreadyNotifiedRecently: false,
    prefs,
    engagement,
    now: candidate.now
  });

  if (!decision.send) {
    const suppressed = await prisma.notificationEvent.create({
      data: {
        organizationId: candidate.organizationId,
        profileId: candidate.profileId ?? undefined,
        kind: KIND_TO_DB[candidate.kind] as never,
        urgency: URGENCY_TO_DB[candidate.urgency ?? "low"] as never,
        requiresAction: candidate.requiresAction,
        channel: ReminderChannel.IN_APP,
        locale: prefs.locale ?? "en-CA",
        title: candidate.kind,
        body: decision.reason,
        status: "SUPPRESSED",
        suppressReason: `${decision.code}: ${decision.reason}`,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId
      }
    });
    return { decision, event: suppressed };
  }

  const channel = decision.channels[0] as NotificationChannel;
  const event = await prisma.notificationEvent.create({
    data: {
      organizationId: candidate.organizationId,
      profileId: candidate.profileId ?? undefined,
      kind: KIND_TO_DB[decision.kind] as never,
      urgency: URGENCY_TO_DB[decision.urgency] as never,
      requiresAction: decision.requiresAction,
      channel: channel as ReminderChannel,
      locale: decision.locale,
      title: decision.title,
      body: decision.body,
      actionHref: decision.actionHref,
      actionLabel: decision.actionLabel,
      status: "QUEUED",
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      maxRetries: decision.retryMax,
      escalateAfterMinutes: decision.escalateAfterMinutes
    }
  });

  return { decision, event };
}

export async function markNotificationDelivered(eventId: string): Promise<void> {
  await prisma.notificationEvent.update({
    where: { id: eventId },
    data: { status: "DELIVERED", deliveredAt: new Date() }
  });
}

export async function markSourceNotificationsDelivered(
  sourceType: string,
  sourceId: string
): Promise<void> {
  await prisma.notificationEvent.updateMany({
    where: { sourceType, sourceId, status: "QUEUED" },
    data: { status: "DELIVERED", deliveredAt: new Date() }
  });
}

export async function markSourceNotificationsFailed(
  sourceType: string,
  sourceId: string,
  error: string
): Promise<void> {
  await prisma.notificationEvent.updateMany({
    where: { sourceType, sourceId, status: "QUEUED" },
    data: { status: "FAILED", suppressReason: error }
  });
}

export async function recordNotificationEngagement(
  eventId: string,
  engagement: "opened" | "acted_upon" | "ignored" | "dismissed"
) {
  const data =
    engagement === "opened"
      ? { status: "OPENED" as const, openedAt: new Date() }
      : engagement === "acted_upon"
        ? { status: "ACTED" as const, actedAt: new Date() }
        : engagement === "ignored"
          ? { status: "IGNORED" as const, ignoredAt: new Date() }
          : { status: "DISMISSED" as const, dismissedAt: new Date() };

  return prisma.notificationEvent.update({ where: { id: eventId }, data });
}

export async function retryFailedNotification(eventId: string): Promise<boolean> {
  const event = await prisma.notificationEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "FAILED") return false;
  if (event.retryCount >= event.maxRetries) return false;
  await prisma.notificationEvent.update({
    where: { id: eventId },
    data: { retryCount: { increment: 1 }, status: "QUEUED" }
  });
  return true;
}

export async function runEscalationScan(now = new Date()): Promise<number> {
  const delivered = await prisma.notificationEvent.findMany({
    where: {
      status: { in: ["DELIVERED", "OPENED"] },
      requiresAction: true,
      actedAt: null,
      dismissedAt: null,
      escalateAfterMinutes: { not: null },
      deliveredAt: { not: null }
    },
    take: 100
  });

  let created = 0;
  for (const event of delivered) {
    const kind = DB_TO_KIND[event.kind];
    if (!kind) continue;
    const proposal = proposeEscalation({
      kind,
      requiresAction: event.requiresAction,
      urgency: event.urgency.toLowerCase() as "critical" | "high" | "normal" | "low",
      deliveredAt: event.deliveredAt!,
      actedAt: event.actedAt,
      dismissedAt: event.dismissedAt,
      escalateAfterMinutes: event.escalateAfterMinutes ?? undefined,
      now
    });
    if (!proposal) continue;
    await considerNotification({
      ...proposal,
      organizationId: event.organizationId,
      profileId: event.profileId,
      sourceType: "notification_escalation",
      sourceId: event.id,
      triggerEvent: "escalation_unanswered"
    });
    created += 1;
  }
  return created;
}

/** Gate used by reminder scan without requiring a full persist round-trip for every channel. */
export function shouldSendAppointmentReminder(input: {
  prefs: UserNotificationPrefs;
  engagement?: NotificationCandidate["engagement"];
  scheduledAt: Date;
  alreadyNotifiedRecently?: boolean;
  now?: Date;
}) {
  return decideNotification({
    kind: "appointment_reminder",
    triggerEvent: "appointment_upcoming",
    requiresAction: true,
    actionableAt: input.scheduledAt,
    prefs: input.prefs,
    engagement: input.engagement,
    alreadyNotifiedRecently: input.alreadyNotifiedRecently,
    now: input.now
  });
}
