"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicHoliday } from "@technovate/shared";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { AppointmentCalendar } from "../../components/healthflow/AppointmentCalendar";
import { WhatsNextCard } from "../../components/healthflow/WhatsNextCard";
import { APPOINTMENT_CATEGORY_COLORS } from "../../lib/role-config";
import { resolvePatientNextStep, VISIT_REQUEST_DRAFT_PATH } from "../../lib/patient-journey";
import { cn } from "../../lib/utils";
import { apiRequest } from "../../lib/api";
import { fetchCanadianHolidaysClient } from "../../lib/public-integrations-client";
import type { HealthFlowAppointment, HealthFlowUser } from "../../types/healthflow";

type FilterOption = { id: string; label: string };

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "NURSE", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
          <div className="flex h-48 items-center justify-center" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <span className="sr-only">Loading calendar</span>
          </div>
        </ProtectedRolePage>
      }
    >
      <CalendarContent />
    </Suspense>
  );
}

function CalendarContent() {
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState<HealthFlowAppointment[]>([]);
  const [doctors, setDoctors] = useState<FilterOption[]>([]);
  const [patients, setPatients] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState(() => searchParams.get("doctorId") ?? "");
  const [profileId, setProfileId] = useState(() => searchParams.get("profileId") ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [role, setRole] = useState<HealthFlowUser["role"] | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [holidayNote, setHolidayNote] = useState<string | null>(null);
  const focusAppointmentId = searchParams.get("appointmentId");

  useEffect(() => {
    const d = searchParams.get("doctorId");
    if (d) setDoctorId(d);
    const p = searchParams.get("profileId");
    if (p) setProfileId(p);
  }, [searchParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const from = dateFrom
      ? new Date(dateFrom).toISOString()
      : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();
    const to = dateTo
      ? new Date(dateTo).toISOString()
      : new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString();
    params.set("from", from);
    params.set("to", to);
    if (doctorId) params.set("doctorId", doctorId);
    if (profileId) params.set("profileId", profileId);
    return params.toString();
  }, [dateFrom, dateTo, doctorId, profileId]);

  useEffect(() => {
    const loadMeta = async (): Promise<void> => {
      try {
        const { isGuestSession, getGuestUser } = await import("../../lib/guest-session");
        if (isGuestSession()) {
          setIsGuest(true);
          setRole(getGuestUser()?.role ?? "PATIENT");
          return;
        }
        const me = await apiRequest<{ user: HealthFlowUser }>("/auth/me");
        setRole(me.user.role);
        const [docRes, patientRes] = await Promise.all([
          apiRequest<{ doctors: { id: string; firstName: string; lastName: string }[] }>("/auth/doctors").catch(() => ({
            doctors: []
          })),
          apiRequest<{ profiles: { id: string; firstName: string; lastName: string }[] }>("/patient-profiles").catch(
            () => ({ profiles: [] })
          )
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
        const { isGuestSession } = await import("../../lib/guest-session");
        const guest = isGuestSession();
        const year = new Date().getFullYear();

        const loadHolidays = async (): Promise<void> => {
          try {
            if (guest) {
              const holidayRes = await fetchCanadianHolidaysClient(year);
              setHolidays(holidayRes.holidays ?? []);
              setHolidayNote(holidayRes.disclaimer ?? holidayRes.integrationNote ?? null);
              return;
            }
            const holidayRes = await apiRequest<{
              holidays: PublicHoliday[];
              disclaimer?: string;
              integrationNote?: string;
            }>(`/resources/holidays?year=${year}`);
            setHolidays(holidayRes.holidays ?? []);
            setHolidayNote(holidayRes.disclaimer ?? holidayRes.integrationNote ?? null);
          } catch {
            const holidayRes = await fetchCanadianHolidaysClient(year);
            setHolidays(holidayRes.holidays ?? []);
            setHolidayNote(holidayRes.disclaimer ?? holidayRes.integrationNote ?? null);
          }
        };

        if (guest) {
          setAppointments([]);
          await loadHolidays();
          return;
        }

        const [apptRes] = await Promise.all([
          apiRequest<{ appointments: HealthFlowAppointment[] }>(`/appointments?${queryString}`),
          loadHolidays()
        ]);
        setAppointments(
          apptRes.appointments.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        );
      } catch {
        setAppointments([]);
        try {
          const year = new Date().getFullYear();
          const holidayRes = await fetchCanadianHolidaysClient(year);
          setHolidays(holidayRes.holidays ?? []);
          setHolidayNote(holidayRes.disclaimer ?? holidayRes.integrationNote ?? null);
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [queryString]);

  const patientStep = useMemo(() => {
    if (role !== "PATIENT") return null;
    return resolvePatientNextStep({ isGuest, appointments, threads: [] });
  }, [role, isGuest, appointments]);

  const upcomingHolidays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setMonth(horizon.getMonth() + 4);
    return holidays
      .filter((h) => {
        const d = new Date(`${h.date}T12:00:00`);
        return d >= today && d <= horizon;
      })
      .slice(0, 8);
  }, [holidays]);

  const focusAppt = focusAppointmentId
    ? appointments.find((a) => a.id === focusAppointmentId)
    : undefined;

  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "NURSE", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          {role === "PATIENT"
            ? "View your visits. To request a new appointment, message the clinic."
            : "Month, week, day, and list views — conflict checks run on save"}
        </p>
      </div>

      {focusAppt ? (
        <div
          className="mb-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"
          role="status"
        >
          <p className="font-medium">Reschedule focus</p>
          <p className="mt-1">
            {new Date(focusAppt.scheduledAt).toLocaleString()} ·{" "}
            {focusAppt.patient
              ? `${focusAppt.patient.firstName} ${focusAppt.patient.lastName}`
              : focusAppt.profile
                ? `${focusAppt.profile.firstName} ${focusAppt.profile.lastName}`
                : "Patient"}{" "}
            · {focusAppt.status.replace(/_/g, " ")}
          </p>
          <p className="mt-1 text-xs text-teal-800">
            Pick a free slot for the same clinician (API blocks overlaps).
          </p>
        </div>
      ) : null}

      {patientStep ? <WhatsNextCard step={patientStep} className="mb-6" compact /> : null}

      {role === "PATIENT" && !loading && appointments.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No visits in this range.{" "}
          <Link href={VISIT_REQUEST_DRAFT_PATH} className="font-medium text-brand-700 underline">
            Request a visit
          </Link>{" "}
          or open the{" "}
          <Link href="/patient/care-guide" className="font-medium text-brand-700 underline">
            Care Guide
          </Link>
          .
        </div>
      ) : null}

      {upcomingHolidays.length > 0 ? (
        <section
          className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3"
          aria-label="Canadian public holidays"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Public holidays (Canada)
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {upcomingHolidays.map((h) => (
              <li
                key={`${h.date}-${h.name}`}
                className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-600/15"
              >
                {new Date(`${h.date}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric"
                })}{" "}
                · {h.localName}
              </li>
            ))}
          </ul>
          {holidayNote ? <p className="mt-2 text-[11px] text-slate-500">{holidayNote}</p> : null}
        </section>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(APPOINTMENT_CATEGORY_COLORS).map(([cat, colors]) => (
          <span
            key={cat}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              colors.bg,
              colors.text
            )}
          >
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
