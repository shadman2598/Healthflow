"use client";

import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { IconChevronRight, IconShield } from "../../components/ui/Icons";

const faqs = [
  {
    q: "How do I view upcoming appointments?",
    a: "Sign in as a patient and open Dashboard, Calendar, or Appointment History. Upcoming visits show date, provider, purpose, and status."
  },
  {
    q: "How do I message the clinic?",
    a: "Go to Messages and start a new thread. You can ask about appointment times, what a visit is for, or general clinic questions."
  },
  {
    q: "How do reminders work?",
    a: "Staff can schedule email, SMS (placeholder), or in-app reminders before your appointment. You can set preferences in Profile."
  },
  {
    q: "How do I update my contact information?",
    a: "Open Profile to review your details. Contact the clinic receptionist to update phone, email, or address on file."
  },
  {
    q: "Who can see my information?",
    a: "Patients see only their own records. Receptionists and doctors see clinic patients they manage. Admins can access audit logs. Staff internal notes are never shown to patients."
  },
  {
    q: "What should I do in an emergency?",
    a: "This app is not for emergencies. If you are experiencing a medical emergency, call local emergency services immediately."
  },
  {
    q: "How is my data protected?",
    a: "HealthFlow uses secure login, role-based access, audit logging, masked healthcare numbers, and encrypted connections in production."
  },
  {
    q: "How do I request a reschedule?",
    a: "Open Appointment History, select an upcoming visit, and tap Request reschedule. Reception will follow up to confirm a new time."
  }
];

export default function FaqPage() {
  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">FAQ</h1>
        <p className="mt-1 text-sm text-slate-500">Common questions about using HealthFlow</p>
      </div>

      <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
        <strong>Emergency disclaimer:</strong> This app is not for emergencies. If you are experiencing a medical emergency, call local emergency services.
      </div>

      <div className="mx-auto max-w-3xl space-y-4">
        {faqs.map((item) => (
          <details key={item.q} className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 font-medium text-slate-900">
              {item.q}
              <IconChevronRight className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-600">{item.a}</div>
          </details>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-slate-400">
        <IconShield className="mr-1 inline h-3.5 w-3.5" />
        HealthFlow supports clinic workflow only — not diagnosis or treatment advice.
      </p>
    </ProtectedRolePage>
  );
}
