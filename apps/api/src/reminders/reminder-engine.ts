import { AppointmentStatus, ReminderChannel, ReminderLogStatus, type ReminderRule } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { reminderQueue } from "./queue";

export function computeReminderTime(scheduledAt: Date, offsetMinutes: number): Date {
  return new Date(scheduledAt.getTime() - offsetMinutes * 60 * 1000);
}

export function isReminderDue(now: Date, scheduledAt: Date, offsetMinutes: number): boolean {
  return now >= computeReminderTime(scheduledAt, offsetMinutes);
}

function reminderMessage(offsetMinutes: number, scheduledAt: Date): string {
  return `Reminder: your appointment is scheduled for ${scheduledAt.toISOString()} (offset ${offsetMinutes}m).`;
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
  rule: ReminderRule
): Promise<string | null> {
  const existing = await prisma.reminderLog.findUnique({
    where: {
      appointmentId_ruleId_channel: {
        appointmentId,
        ruleId: rule.id,
        channel: rule.channel
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
      status: ReminderLogStatus.PENDING
    }
  });

  return created.id;
}

export async function scanAndEnqueueDueReminders(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [rules, appointments] = await Promise.all([
    prisma.reminderRule.findMany({ where: { enabled: true } }),
    prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        scheduledAt: { gte: now, lte: horizon }
      },
      include: { patient: true },
      orderBy: { scheduledAt: "asc" }
    })
  ]);

  let enqueuedCount = 0;

  for (const appointment of appointments) {
    const orgRules = rules.filter((r) => r.organizationId === appointment.organizationId);

    for (const rule of orgRules) {
      if (!isReminderDue(now, appointment.scheduledAt, rule.offsetMinutes)) continue;

      const logId = await ensurePendingLog(
        appointment.organizationId,
        appointment.id,
        appointment.patientId,
        rule
      );
      if (!logId) continue;

      await enqueueReminderLog(logId);
      enqueuedCount += 1;
    }
  }

  return enqueuedCount;
}

export async function processReminderLog(reminderLogId: string): Promise<void> {
  const log = await prisma.reminderLog.findUnique({
    where: { id: reminderLogId },
    include: { appointment: true, patient: true, rule: true }
  });

  if (!log) return;
  if (log.status === ReminderLogStatus.SENT) return;
  if (log.appointment.status !== AppointmentStatus.SCHEDULED && log.appointment.status !== AppointmentStatus.CONFIRMED) return;

  if (log.organizationId !== log.appointment.organizationId || log.organizationId !== log.patient.organizationId) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.FAILED, error: "Organization mismatch" }
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

  const text = reminderMessage(offsetMinutes, log.appointment.scheduledAt);

  try {
    if (log.channel === ReminderChannel.EMAIL) {
      if (!log.patient.email) throw new Error("Patient email is missing");

      const { sendEmail } = await import("./providers/email.provider");
      const result = await sendEmail({ to: log.patient.email, subject: "Appointment reminder", text });

      await prisma.reminderLog.update({
        where: { id: log.id },
        data: { status: ReminderLogStatus.SENT, sentAt: new Date(), providerMessageId: result.providerMessageId, error: null }
      });
      return;
    }

    if (log.channel === ReminderChannel.SMS) {
      if (!log.patient.phone) throw new Error("Patient phone is missing");

      const { sendSms } = await import("./providers/sms.provider");
      const result = await sendSms({ to: log.patient.phone, body: text });

      await prisma.reminderLog.update({
        where: { id: log.id },
        data: { status: ReminderLogStatus.SENT, sentAt: new Date(), providerMessageId: result.providerMessageId, error: null }
      });
      return;
    }
  } catch (error) {
    await prisma.reminderLog.update({
      where: { id: log.id },
      data: { status: ReminderLogStatus.FAILED, error: error instanceof Error ? error.message : "Unknown send error" }
    });
  }
}
