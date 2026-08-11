import {
  PrismaClient,
  UserRole,
  AppointmentCategory,
  AppointmentStatus,
  ReminderChannel,
  MessageThreadStatus,
  MessagePriority,
  ReminderStatus,
  AuditAction
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FIRST_NAMES = ["Jane", "John", "Maria", "David", "Sarah", "Michael", "Emily", "Robert", "Lisa", "James", "Anna", "Chris", "Laura", "Daniel", "Sophie", "Mark", "Olivia", "Paul", "Rachel", "Kevin", "Nina", "Brian", "Chloe", "Andrew", "Grace"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White"];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const staffHash = await bcrypt.hash("Staff123!", 10);
  const patientHash = await bcrypt.hash("Patient123!", 10);

  // Clear in dependency order
  await prisma.auditLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.roleInvite.deleteMany();
  await prisma.reminderRule.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const clinic = await prisma.organization.create({
    data: { name: "HealthFlow Demo Clinic" }
  });

  const admin = await prisma.user.create({
    data: {
      organizationId: clinic.id,
      email: "admin@healthflow.demo",
      passwordHash,
      role: UserRole.ADMIN
    }
  });

  const doctors = await Promise.all(
    ["Dr. Sarah Chen", "Dr. James Wilson", "Dr. Emily Park"].map(async (name, i) => {
      const [firstName, ...rest] = name.replace("Dr. ", "").split(" ");
      const lastName = rest.join(" ");
      const email = `doctor${i + 1}@healthflow.demo`;
      return prisma.user.create({
        data: {
          organizationId: clinic.id,
          email,
          passwordHash: staffHash,
          role: UserRole.DOCTOR,
          doctorProfile: {
            create: {
              organizationId: clinic.id,
              firstName,
              lastName,
              specialty: ["General Medicine", "Cardiology", "Dermatology"][i]
            }
          }
        },
        include: { doctorProfile: true }
      });
    })
  );

  const receptionists = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.user.create({
        data: {
          organizationId: clinic.id,
          email: `receptionist${i + 1}@healthflow.demo`,
          passwordHash: staffHash,
          role: UserRole.RECEPTIONIST,
          staffProfile: {
            create: {
              organizationId: clinic.id,
              firstName: ["Alex", "Jordan", "Taylor"][i],
              lastName: ["Morgan", "Lee", "Brooks"][i]
            }
          }
        }
      })
    )
  );

  await prisma.roleInvite.createMany({
    data: [
      {
        organizationId: clinic.id,
        code: "HF-RECEPT-2026",
        role: UserRole.RECEPTIONIST,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        organizationId: clinic.id,
        code: "HF-RECEPT-DEMO-1",
        role: UserRole.RECEPTIONIST,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        organizationId: clinic.id,
        code: "HF-RECEPT-DEMO-2",
        role: UserRole.RECEPTIONIST,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        organizationId: clinic.id,
        code: "HF-DOCTOR-2026",
        role: UserRole.DOCTOR,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        organizationId: clinic.id,
        code: "HF-DOCTOR-DEMO-1",
        role: UserRole.DOCTOR,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        organizationId: clinic.id,
        code: "HF-DOCTOR-DEMO-2",
        role: UserRole.DOCTOR,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  await prisma.reminderRule.createMany({
    data: [
      { organizationId: clinic.id, name: "24h email", offsetMinutes: 1440, channel: ReminderChannel.EMAIL, enabled: true },
      { organizationId: clinic.id, name: "2h email", offsetMinutes: 120, channel: ReminderChannel.EMAIL, enabled: true },
      { organizationId: clinic.id, name: "quick demo 2m", offsetMinutes: 2, channel: ReminderChannel.EMAIL, enabled: true }
    ]
  });

  const doctorProfiles = doctors.map((d) => d.doctorProfile!);
  const profiles = [];

  for (let i = 0; i < 25; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const email = `patient${i + 1}@healthflow.demo`;
    const hcn = `HCN${String(100000 + i)}`;
    const doctor = doctorProfiles[i % doctorProfiles.length];

    const lastCheckup = new Date();
    lastCheckup.setMonth(lastCheckup.getMonth() - (i % 5 === 0 ? 14 : 3));

    const user =
      i < 5
        ? await prisma.user.create({
            data: {
              organizationId: clinic.id,
              email,
              passwordHash: patientHash,
              role: UserRole.PATIENT,
              privacyConsentAt: new Date(),
              patientProfile: {
                create: {
                  organizationId: clinic.id,
                  firstName: fn,
                  lastName: ln,
                  email,
                  phone: `+1555555${String(1000 + i).padStart(4, "0")}`,
                  healthcareNumber: hcn,
                  dateOfBirth: new Date(1970 + (i % 30), i % 12, (i % 28) + 1),
                  heightCm: 160 + (i % 30),
                  weightKg: 60 + (i % 40),
                  assignedDoctorId: doctor.id,
                  isRegularPatient: i % 3 === 0
                }
              }
            },
            include: { patientProfile: true }
          })
        : null;

    const profile = user?.patientProfile
      ? user.patientProfile
      : await prisma.patientProfile.create({
          data: {
            organizationId: clinic.id,
            userId: null,
            firstName: fn,
            lastName: ln,
            email,
            phone: `+1555555${String(1000 + i).padStart(4, "0")}`,
            healthcareNumber: hcn,
            dateOfBirth: new Date(1970 + (i % 30), i % 12, (i % 28) + 1),
            heightCm: 160 + (i % 30),
            weightKg: 60 + (i % 40),
            assignedDoctorId: doctor.id,
            isRegularPatient: i % 3 === 0
          }
        });

    await prisma.patient.create({
      data: {
        organizationId: clinic.id,
        profileId: profile.id,
        firstName: fn,
        lastName: ln,
        email,
        phone: profile.phone
      }
    });

    profiles.push(profile);
  }

  const statuses: AppointmentStatus[] = [
    "SCHEDULED",
    "CONFIRMED",
    "COMPLETED",
    "CANCELLED",
    "RESCHEDULE_REQUESTED",
    "MISSED"
  ];
  const categories: AppointmentCategory[] = [
    "CHECKUP",
    "FOLLOW_UP",
    "MEDICATION",
    "LAB_REVIEW",
    "URGENT",
    "CONSULTATION",
    "OTHER"
  ];

  const patients = await prisma.patient.findMany({ where: { organizationId: clinic.id } });
  const appointments = [];

  for (let i = 0; i < 50; i++) {
    const patient = patients[i % patients.length];
    const profile = profiles.find((p) => p.id === patient.profileId);
    const doctor = doctorProfiles[i % doctorProfiles.length];
    const days = i < 20 ? i - 5 : i - 30;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + days);
    scheduledAt.setHours(9 + (i % 8), (i % 4) * 15, 0, 0);

    const appt = await prisma.appointment.create({
      data: {
        organizationId: clinic.id,
        patientId: patient.id,
        profileId: profile?.id,
        doctorId: doctor.id,
        scheduledAt,
        reason: ["Annual checkup", "Follow-up", "Lab review", "Consultation", "Medication review"][i % 5],
        category: categories[i % categories.length],
        status: statuses[i % statuses.length],
        patientNotes: i % 4 === 0 ? "Please confirm appointment time." : undefined
      }
    });
    appointments.push(appt);
  }

  const patientUsers = await prisma.user.findMany({
    where: { organizationId: clinic.id, role: UserRole.PATIENT }
  });

  for (let i = 0; i < 20; i++) {
    const profile = profiles[i % profiles.length];
    const patientUser = patientUsers[i % patientUsers.length];
    const thread = await prisma.messageThread.create({
      data: {
        organizationId: clinic.id,
        patientProfileId: profile.id,
        subject: ["Appointment question", "Reschedule request", "Specialist referral", "Reminder follow-up"][i % 4],
        status: [MessageThreadStatus.UNREAD, MessageThreadStatus.PENDING, MessageThreadStatus.RESOLVED, MessageThreadStatus.READ][i % 4],
        priority: i % 5 === 0 ? MessagePriority.HIGH : MessagePriority.NORMAL,
        assignedDoctorId: doctorProfiles[i % doctorProfiles.length].id,
        messages: {
          create: [
            {
              senderId: patientUser?.id ?? admin.id,
              body: "Hello, I have a question about my upcoming appointment.",
              isInternal: false
            },
            {
              senderId: receptionists[0].id,
              body: "Thanks for reaching out. We will confirm your appointment shortly.",
              isInternal: false
            }
          ]
        }
      }
    });
    void thread;
  }

  for (let i = 0; i < 30; i++) {
    const appt = appointments[i % appointments.length];
    const profile = profiles.find((p) => p.id === appt.profileId);
    if (!profile) continue;

    await prisma.reminder.create({
      data: {
        organizationId: clinic.id,
        appointmentId: appt.id,
        profileId: profile.id,
        offsetMinutes: [60, 180, 720, 1440][i % 4],
        channel: ReminderChannel.EMAIL,
        status: [ReminderStatus.SCHEDULED, ReminderStatus.SENT, ReminderStatus.FAILED][i % 3],
        sentAt: i % 3 === 1 ? new Date() : undefined
      }
    });
  }

  const auditActions: AuditAction[] = [
    AuditAction.LOGIN,
    AuditAction.PATIENT_VIEWED,
    AuditAction.PATIENT_CREATED,
    AuditAction.APPOINTMENT_CREATED,
    AuditAction.MESSAGE_SENT,
    AuditAction.REMINDER_SENT,
    AuditAction.HEALTHCARE_NUMBER_REVEALED
  ];

  for (let i = 0; i < 50; i++) {
    await prisma.auditLog.create({
      data: {
        organizationId: clinic.id,
        actorId: [admin.id, receptionists[0].id, doctors[0].id][i % 3],
        actorRole: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.DOCTOR][i % 3],
        action: auditActions[i % auditActions.length],
        targetType: "Demo",
        targetId: `seed-${i}`,
        ipAddress: "127.0.0.1",
        metadata: { seed: true }
      }
    });
  }

  console.log("HealthFlow seed complete.");
  console.log("Admin: admin@healthflow.demo / Admin123!");
  console.log("Staff: doctor1@healthflow.demo, receptionist1@healthflow.demo / Staff123!");
  console.log("Patient: patient1@healthflow.demo / Patient123!");
  console.log("Invite codes: HF-RECEPT-2026, HF-DOCTOR-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
