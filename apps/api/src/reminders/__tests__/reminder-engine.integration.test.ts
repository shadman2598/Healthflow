import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentStatus, ReminderChannel, ReminderLogStatus } from "@prisma/client";

vi.mock("../queue", () => ({
  reminderQueue: { add: vi.fn().mockResolvedValue(undefined) }
}));

import { prisma } from "../../lib/prisma";
import { processReminderLog, scanAndEnqueueDueReminders } from "../reminder-engine";

async function createClinic(name?: string) {
  return prisma.organization.create({
    data: { name: name ?? `Clinic-${Date.now()}-${Math.random()}` }
  });
}

async function createPatient(orgId: string, overrides: { email?: string; phone?: string } = {}) {
  return prisma.patient.create({
    data: {
      organizationId: orgId,
      firstName: "Test",
      lastName: "Patient",
      email: overrides.email ?? "test@clinic.test",
      phone: overrides.phone ?? "+15555550111"
    }
  });
}

describe("reminder engine integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.reminderLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.reminderRule.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  });

  it("creates a PENDING log, then marks SENT with dev email provider", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    const rule = await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "2min email",
        offsetMinutes: 2,
        channel: ReminderChannel.EMAIL,
        enabled: true
      }
    });

    const now = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.SCHEDULED
      }
    });

    const enqueued = await scanAndEnqueueDueReminders(now);
    expect(enqueued).toBe(1);

    const log = await prisma.reminderLog.findUnique({
      where: {
        appointmentId_ruleId_channel: {
          appointmentId: appointment.id,
          ruleId: rule.id,
          channel: ReminderChannel.EMAIL
        }
      }
    });
    expect(log).not.toBeNull();
    expect(log!.status).toBe("PENDING");

    await processReminderLog(log!.id);

    const sent = await prisma.reminderLog.findUnique({ where: { id: log!.id } });
    expect(sent!.status).toBe("SENT");
    expect(sent!.sentAt).not.toBeNull();
    expect(sent!.providerMessageId).toContain("dev-email-");
    expect(sent!.error).toBeNull();
  });

  it("sends via dev SMS provider", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id, { phone: "+15555550222" });

    const rule = await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "2min sms",
        offsetMinutes: 2,
        channel: ReminderChannel.SMS,
        enabled: true
      }
    });

    const now = new Date();
    await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.SCHEDULED
      }
    });

    await scanAndEnqueueDueReminders(now);

    const log = await prisma.reminderLog.findFirst({ where: { ruleId: rule.id } });
    expect(log).not.toBeNull();

    await processReminderLog(log!.id);

    const sent = await prisma.reminderLog.findUnique({ where: { id: log!.id } });
    expect(sent!.status).toBe("SENT");
    expect(sent!.providerMessageId).toContain("dev-sms-");
  });

  it("skips disabled rules", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "disabled rule",
        offsetMinutes: 2,
        channel: ReminderChannel.EMAIL,
        enabled: false
      }
    });

    const now = new Date();
    await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.SCHEDULED
      }
    });

    const enqueued = await scanAndEnqueueDueReminders(now);
    expect(enqueued).toBe(0);

    const logCount = await prisma.reminderLog.count();
    expect(logCount).toBe(0);
  });

  it("skips cancelled appointments", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "2min email",
        offsetMinutes: 2,
        channel: ReminderChannel.EMAIL,
        enabled: true
      }
    });

    const now = new Date();
    await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.CANCELLED
      }
    });

    const enqueued = await scanAndEnqueueDueReminders(now);
    expect(enqueued).toBe(0);
  });

  it("does not re-send an already SENT log", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    const rule = await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "2min email",
        offsetMinutes: 2,
        channel: ReminderChannel.EMAIL,
        enabled: true
      }
    });

    const now = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.SCHEDULED
      }
    });

    await scanAndEnqueueDueReminders(now);
    const log = await prisma.reminderLog.findFirst({ where: { ruleId: rule.id } });
    await processReminderLog(log!.id);

    const firstSent = await prisma.reminderLog.findUnique({ where: { id: log!.id } });
    const originalMsgId = firstSent!.providerMessageId;

    // Running scan again should not create a new log or reset the existing one
    const secondEnqueued = await scanAndEnqueueDueReminders(now);
    expect(secondEnqueued).toBe(0);

    const unchanged = await prisma.reminderLog.findUnique({ where: { id: log!.id } });
    expect(unchanged!.status).toBe("SENT");
    expect(unchanged!.providerMessageId).toBe(originalMsgId);

    // Directly re-processing should be a no-op
    await processReminderLog(log!.id);
    const stillSent = await prisma.reminderLog.findUnique({ where: { id: log!.id } });
    expect(stillSent!.status).toBe("SENT");
    expect(stillSent!.providerMessageId).toBe(originalMsgId);
  });

  it("skips appointment too far in the future (beyond 48h horizon)", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    await prisma.reminderRule.create({
      data: {
        organizationId: clinic.id,
        name: "24h email",
        offsetMinutes: 1440,
        channel: ReminderChannel.EMAIL,
        enabled: true
      }
    });

    const now = new Date();
    await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 72 * 60 * 60_000), // 72 hours out
        status: AppointmentStatus.SCHEDULED
      }
    });

    const enqueued = await scanAndEnqueueDueReminders(now);
    expect(enqueued).toBe(0);
  });

  it("handles multiple rules on the same appointment", async () => {
    const clinic = await createClinic();
    const patient = await createPatient(clinic.id);

    await prisma.reminderRule.createMany({
      data: [
        { organizationId: clinic.id, name: "2min email", offsetMinutes: 2, channel: ReminderChannel.EMAIL, enabled: true },
        { organizationId: clinic.id, name: "2min sms", offsetMinutes: 2, channel: ReminderChannel.SMS, enabled: true }
      ]
    });

    const now = new Date();
    await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        scheduledAt: new Date(now.getTime() + 60_000),
        status: AppointmentStatus.SCHEDULED
      }
    });

    const enqueued = await scanAndEnqueueDueReminders(now);
    expect(enqueued).toBe(2);

    const logs = await prisma.reminderLog.findMany();
    expect(logs).toHaveLength(2);

    const channels = logs.map((l) => l.channel).sort();
    expect(channels).toEqual(["EMAIL", "SMS"]);
  });
});
