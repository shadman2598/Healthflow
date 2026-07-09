export type Role = "ADMIN" | "STAFF";

export type User = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  organizationId: string;
  activeOrganizationId: string;
  organization: Clinic;
};

export type Clinic = {
  id: string;
  name: string;
  createdAt: string;
};

export type Patient = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
};

export type AppointmentStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";

export type Appointment = {
  id: string;
  organizationId: string;
  patientId: string;
  scheduledAt: string;
  reason: string | null;
  status: AppointmentStatus;
  createdAt: string;
  patient?: Patient;
};

export type ReminderChannel = "EMAIL" | "SMS";

export type ReminderRule = {
  id: string;
  organizationId: string;
  name: string;
  offsetMinutes: number;
  channel: ReminderChannel;
  enabled: boolean;
  createdAt: string;
};

export type ReminderLogStatus = "PENDING" | "SENT" | "FAILED";

export type ReminderLog = {
  id: string;
  organizationId: string;
  appointmentId: string;
  patientId: string;
  ruleId: string | null;
  channel: ReminderChannel;
  providerMessageId: string | null;
  status: ReminderLogStatus;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  appointment?: Appointment;
  patient?: Patient;
  rule?: ReminderRule;
};
