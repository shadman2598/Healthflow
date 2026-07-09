export type HealthFlowRole = "PATIENT" | "RECEPTIONIST" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
};

export type HealthFlowUser = {
  id: string;
  email: string;
  role: HealthFlowRole;
  createdAt: string;
  organizationId: string;
  activeOrganizationId: string;
  lastLoginAt?: string | null;
  privacyConsentAt?: string | null;
  organization: Organization;
  redirectTo?: string;
  patientProfile?: PatientProfile | null;
  doctorProfile?: DoctorProfile | null;
  staffProfile?: StaffProfile | null;
};

export type PatientProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  healthcareNumber?: string;
  dateOfBirth?: string | null;
};

export type DoctorProfile = {
  id: string;
  firstName: string;
  lastName: string;
  specialty?: string | null;
};

export type StaffProfile = {
  id: string;
  firstName: string;
  lastName: string;
};

export type AppointmentCategory =
  | "CHECKUP"
  | "FOLLOW_UP"
  | "MEDICATION"
  | "LAB_REVIEW"
  | "URGENT"
  | "CONSULTATION"
  | "OTHER";

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "RESCHEDULE_REQUESTED"
  | "MISSED";

export type HealthFlowAppointment = {
  id: string;
  organizationId: string;
  patientId: string;
  scheduledAt: string;
  reason: string | null;
  patientNotes?: string | null;
  staffNotes?: string | null;
  status: AppointmentStatus;
  category: AppointmentCategory;
  createdAt: string;
  patient?: { id: string; firstName: string; lastName: string };
  profile?: PatientProfile;
  doctor?: { id: string; firstName: string; lastName: string } | null;
};

export type MessageThreadStatus = "UNREAD" | "READ" | "PENDING" | "RESOLVED" | "ARCHIVED";
export type MessagePriority = "NORMAL" | "HIGH";

export type MessageThread = {
  id: string;
  organizationId: string;
  patientProfileId: string;
  subject: string;
  status: MessageThreadStatus;
  priority: MessagePriority;
  assignedDoctorId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patientProfile?: { id: string; firstName: string; lastName: string };
  messages?: Message[];
};

export type Message = {
  id: string;
  threadId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  sender?: { id: string; email: string; role: HealthFlowRole };
};

export type ResourceResult = {
  name: string;
  address: string;
  phone: string;
  distance: string;
  website: string;
};

export type OverdueCheckup = {
  id: string;
  firstName: string;
  lastName: string;
  lastCheckupDate: string;
  daysOverdue: number;
  isOverdue: boolean;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; email: string; role: HealthFlowRole };
};
