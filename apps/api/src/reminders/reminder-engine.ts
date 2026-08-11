import {
  AppointmentStatus,
  ReminderChannel,
  ReminderFrequency,
  ReminderLogStatus,
  type ReminderRule
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { reminderQueue } from "./queue";

export function computeReminderTime(scheduledAt: Date, offsetMinutes: number): Date {
  return new Date(scheduledAt.getTime() - offsetMinutes * 60 * 1000);
}

export function isReminderDue(now: Date, scheduledAt: Date, offsetMinutes: number): boolean {
  return now >= computeReminderTime(scheduledAt, offsetMinutes);
}

function reminderMessage(offsetMinutes: number, scheduledAt: Date, frequency?: ReminderFrequency): string {
  const when = scheduledAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  if (frequency === ReminderFrequency.EVERY_DAY) {
    return `Daily reminder: your appointment is scheduled for ${when}.`;
  }
  if (frequency === ReminderFrequency.WEEKLY) {
    return `Weekly reminder: your appointment is scheduled for ${when}.`;
  }
  return `Reminder: your appointment is scheduled for ${when}.`;
}

function isoDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function channelAllowed(
  channel: ReminderChannel,
  prefs: { reminderPrefEmail: boolean; reminderPrefSms: boolean; reminderPrefApp: boolean } | null
): boolean {
  if (!prefs) return channel === ReminderChannel.EMAIL;
  if (channel === ReminderChannel.EMAIL) return prefs.reminderPrefEmail;
  if (channel === ReminderChannel.SMS) return prefs.reminderPrefSms;
  if (channel === ReminderChannel.IN_APP) return prefs.reminderPrefApp;
  return false;
}

/**
 * Decide whether this rule should fire now for the patient's chosen frequency,
 * and which occurrenceKey to use for deduping recurring sends.
 */
export function frequencyMatch(
  frequency: ReminderFrequency,
  now: Date,
  scheduledAt: Date,
  rule: ReminderRule
): { due: boolean; occurrenceKey: string } {
  const msUntil = scheduledAt.getTime() - now.getTime();
  if (msUntil < 0) return { due: false, occurrenceKey: "once" };

  const hoursUntil = msUntil / (60 * 60 * 1000);
  const daysUntil = msUntil / (24 * 60 * 60 * 1000);

  if (frequency === ReminderFrequency.DAY_BEFORE) {
    // Prefer clinic "day before" style rules (~12h–36h). Fall back to any due rule inside 36h.
    const isDayBeforeRule = rule.offsetMinutes >= 12 * 60 && rule.offsetMinutes <= 36 * 60;
    const due =
      (isDayBeforeRule && isReminderDue(now, scheduledAt, rule.offsetMinutes)) ||
      (!isDayBeforeRule && hoursUntil <= 36 && isReminderDue(now, scheduledAt, rule.offsetMinutes));
    return { due, occurrenceKey: "once" };
  }

  if (frequency === ReminderFrequency.WEEKLY) {
    // Once per ISO week while the appointment is still upcoming (any enabled channel rule).
    if (daysUntil > 60) return { due: false, occurrenceKey: "once" };
    return { due: true, occurrenceKey: `week:${isoWeekKey(now)}` };
  }

  // EVERY_DAY — once per calendar day until the appointment.
  if (daysUntil > 30) return { due: false, occurrenceKey: "once" };
  return { due: true, occurrenceKey: `day:${isoDateKey(now)}` };
}

async function enqueueReminderLog(reminderLogId: string): Promise<void> {
  try {
    await reminderQueue.add(
      "send-reminder" as never,
      { reminderLogId },
      {
        jobId: reminderLogId,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown queue error";
    if (
      message.includes("Job is already waiting") ||
      message.toLowerCase().includes("job id already exists")
    ) {
      return;
    }
    throw error;
  }
}

async function ensurePendingLog(
  organizationId: string,
  appointmentId: string,
  patientId: string,
  rule: ReminderRule,
  occurrenceKey: string
): Promise<string | null> {
  const existing = await prisma.reminderLog.findUnique({
    where: {
      appointmentId_ruleId_channel_occurrenceKey: {
        appointmentId,
        ruleId: rule.id,
        channel: rule.channel,
        occurrenceKey
      }
    }
  });

  if (existing?.status === ReminderLogStatus.SENT) return null;

  if (existing) {
    await prisma.reminderLog.update({
      where: { id: existing.id },
      data: { status: ReminderLogStatus.PENDING, error: null }
    });
    return existing.id;
  }

  const created = await prisma.reminderLog.create({
    data: {
      organizationId,
      appointmentId,
      patientId,
      ruleId: rule.id,
      channel: rule.channel,
      occurrenceKey,
      status: ReminderLogStatus.PENDING
    }
  });

  return created.id;
}

export async function scanAndEnqueueDueReminders(now = new Date()): Promise<number> {
  // Recurring prefs need a longer look-ahead than the old 48h clinic-rule window.
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [rules, appointments] = await Promise.all([
    prisma.reminderRule.findMany({ where: { enabled: true } }),
    prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        scheduledAt: { gte: now, lte: horizon }
      },
      include: {
        patient: { include: { profile: true } }
      },
      orderBy: { scheduledAt: "asc" }
    })
  ]);

  let enqueuedCount = 0;

  for (const appointment of appointments) {
    const orgRules = rules.filter((r) => r.organizationId === appointment.organizationId);
    const prefs = appointment.patient.profile;
    const frequency = prefs?.reminderFrequency ?? ReminderFrequency.DAY_BEFORE;

    // For recurring modes, prefer one primary rule per channel to avoid duplicate daily emails.
    const rulesToConsider =
      frequency === ReminderFrequency.DAY_BEFORE
        ? orgRules
        : pickPrimaryRulesPerChannel(orgRules);

    for (const rule of rulesToConsider) {
      if (!channelAllowed(rule.channel, prefs)) continue;

      const { due, occurrenceKey } = frequencyMatch(frequency, now, appointment.scheduledAt, rule);
      if (!due) continue;

      const logId = await ensurePendingLog(
        appointment.organizationId,
        appointment.id,
        appointment.patientId,
        rule,
        occurrenceKey
      );
      if (!logId) continue;

      await enqueueReminderLog(logId);
      enqueuedCount += 1;
    }
  }

  return enqueuedCount;
}

/** Prefer the longest-offset enabled rule for each channel (usually the 24h email). */
function pickPrimaryRulesPerChannel(rules: ReminderRule[]): ReminderRule[] {
  const byChannel = new Map<ReminderChannel, ReminderRule>();
  for (const rule of rules) {
    const current = byChannel.get(rule.channel);
    if (!current || rule.offsetMinutes > current.offsetMinutes) {
      byChannel.set(rule.channel, rule);
    }
  }
  return [...byChannel.values()];
}

export async function processReminderLog(reminderLogId: string): Promise<void> {
  const log = await prisma.reminderLog.findUnique({
    where: { id: reminderLogId },
    include: {
      appointment: true,
      patient: { include: { profile: true } },
      rule: true
    }
  });

  if (!log) return;
  if (log.status === ReminderLogStatus.SENT) return;
  if (log.appointment.status !== AppointmentStatus.SCHEDULED && log.appointment.status !== AppointmentStatus.CONFIRMED) {
    return;
  }

  if (log.organizationId !== log.appointment.organizationId || log.organizationId !== log.patient.organizationId) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.FAILED, error: "Organization mismatch" }
    });
    return;
  }

  const prefs = log.patient.profile;
  if (!channelAllowed(log.channel, prefs)) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.FAILED, error: "Channel disabled by patient preference" }
    });
    return;
  }

  const offsetMinutes = log.rule?.offsetMinutes;
  if (!offsetMinutes) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.FAILED, error: "Missing reminder rule offset" }
    });
    return;
  }

  const frequency = prefs?.reminderFrequency ?? ReminderFrequency.DAY_BEFORE;
  const text = reminderMessage(offsetMinutes, log.appointment.scheduledAt, frequency);

  try {
    if (log.channel === ReminderChannel.EMAIL) {
      if (!log.patient.email) throw new Error("Patient email is missing");

      const { sendEmail } = await import("./providers/email.provider");
      const result = await sendEmail({ to: log.patient.email, subject: "Appointment reminder", text });

      await prisma.reminderLog.update({
        where: { id: log.id },
        data: {
          status: ReminderLogStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          error: null
        }
      });
      return;
    }

    if (log.channel === ReminderChannel.SMS) {
      if (!log.patient.phone) throw new Error("Patient phone is missing");

      const { sendSms } = await import("./providers/sms.provider");
      const result = await sendSms({ to: log.patient.phone, body: text });

      await prisma.reminderLog.update({
        where: { id: log.id },
        data: {
          status: ReminderLogStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          error: null
        }
      });
      return;
    }

    // IN_APP: mark sent (UI can surface logs); no external provider yet.
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.SENT, sentAt: new Date(), error: null }
    });
  } catch (error) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: {
        status: ReminderLogStatus.FAILED,
        error: error instanceof Error ? error.message : "Unknown send error"
      }
    });
  }
}
