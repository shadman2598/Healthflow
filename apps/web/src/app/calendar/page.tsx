"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { AppointmentCalendar } from "../../components/healthflow/AppointmentCalendar";
import { APPOINTMENT_CATEGORY_COLORS } from "../../lib/role-config";
import { cn } from "../../lib/utils";
import { apiRequest } from "../../lib/api";
import type { HealthFlowAppointment } from "../../types/healthflow";

type FilterOption = { id: string; label: string };

export default function CalendarPage() {
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [doctors, setDoctors] = useState<FilterOption[]>([]);
  const [patients, setPatients] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const from = dateFrom ? new Date(dateFrom).toISOString() : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();
    const to = dateTo ? new Date(dateTo).toISOString() : new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString();
    params.set("from", from);
    params.set("to", to);
    if (doctorId) params.set("doctorId", doctorId);
    if (profileId) params.set("profileId", profileId);
    return params.toString();
  }, [dateFrom, dateTo, doctorId, profileId]);

  useEffect(() => {
    const loadMeta = async (): Promise<void> => {
      try {
        const [docRes, patientRes] = await Promise.all([
          apiRequest<{ doctors: { id: string; firstName: string; lastName: string }[] }>("/auth/doctors").catch(() => ({ doctors: [] })),
          apiRequest<{ profiles: { id: string; firstName: string; lastName: string }[] }>("/patient-profiles").catch(() => ({ profiles: [] }))
        ]);
        setDoctors(docRes.doctors.map((d) => ({ id: d.id, label: `Dr. ${d.lastName}` })));
        setPatients(patientRes.profiles.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}` })));
      } catch {
        /* patient role may not access doctors list */
      }
    };
    void loadMeta();
  }, []);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const res = await apiRequest<{ appointments: HealthFlowAppointment[] }>(`/appointments?${queryString}`);
        setAppointments(
          res.appointments.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [queryString]);

  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Month, week, day, and list views with filters</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(APPOINTMENT_CATEGORY_COLORS).map(([cat, colors]) => (
          <span key={cat} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", colors.bg, colors.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            {cat.replace("_", " ")}
          </span>
        ))}
      </div>

      <AppointmentCalendar
        appointments={appointments}
        loading={loading}
        doctors={doctors}
        patients={patients}
        doctorId={doctorId}
        profileId={profileId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDoctorChange={setDoctorId}
        onProfileChange={setProfileId}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />
    </ProtectedRolePage>
  );
}
