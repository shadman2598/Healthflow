import "dotenv/config";
import { AppointmentStatus, ReminderChannel } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const clinic = await prisma.organization.upsert({
    where: { name: "Technovate Main Clinic" },
    update: {},
    create: { name: "Technovate Main Clinic" }
  });

  const patient = await prisma.patient.create({
    data: {
      organizationId: clinic.id,
      firstName: "Demo",
      lastName: "Patient",
      email: "demo.patient@clinic.test",
      phone: "+15555550199"
    }
  });

  await prisma.reminderRule.upsert({
    where: {
      organizationId_name: {
        organizationId: clinic.id,
        name: "1m demo email"
      }
    },
    update: {
      enabled: true,
      offsetMinutes: 1,
      channel: ReminderChannel.EMAIL
    },
    create: {
      organizationId: clinic.id,
      name: "1m demo email",
      enabled: true,
      offsetMinutes: 1,
      channel: ReminderChannel.EMAIL
    }
  });

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: clinic.id,
      patientId: patient.id,
      scheduledAt: new Date(Date.now() + 2 * 60 * 1000),
      reason: "Demo reminder trigger",
      status: AppointmentStatus.SCHEDULED
    }
  });

  // eslint-disable-next-line no-console
  console.log("Created demo appointment", {
    appointmentId: appointment.id,
    patientId: patient.id,
    scheduledAt: appointment.scheduledAt.toISOString()
  });
  // eslint-disable-next-line no-console
  console.log("Wait ~1 minute for scheduler tick + due reminder job.");
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
