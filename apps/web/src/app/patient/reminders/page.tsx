"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { IconBell } from "../../../components/ui/Icons";
import { ApiError, apiRequest } from "../../../lib/api";
import { isGuestSession } from "../../../lib/guest-session";
import { cn } from "../../../lib/utils";
import { useToast } from "../../../contexts/toast-context";

type ReminderFrequency = "DAY_BEFORE" | "WEEKLY" | "EVERY_DAY";

type PatientProfile = {
  id: string;
  reminderPrefEmail?: boolean;
  reminderPrefSms?: boolean;
  reminderPrefApp?: boolean;
  reminderFrequency?: ReminderFrequency;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
};

const FREQUENCY_OPTIONS: {
  value: ReminderFrequency;
  title: string;
  description: string;
}[] = [
  {
    value: "DAY_BEFORE",
    title: "Day before appointment",
    description: "One reminder about 24 hours before your visit."
  },
  {
    value: "WEEKLY",
    title: "Once a week",
    description: "A weekly reminder while your appointment is upcoming."
  },
  {
    value: "EVERY_DAY",
    title: "Every day",
    description: "A daily reminder until your appointment day."
  }
];

export default function PatientRemindersPage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const { isGuestSession, GUEST_USER } = await import("../../../lib/guest-session");
        if (isGuestSession()) {
          setGuest(true);
          setProfile({
            id: GUEST_USER.patientProfile!.id,
            reminderPrefEmail: true,
            reminderPrefSms: false,
            reminderPrefApp: true,
            reminderFrequency: "DAY_BEFORE"
          });
          return;
        }
        const res = await apiRequest<{ profiles: PatientProfile[] }>("/patient-profiles");
        setProfile(res.profiles[0] ?? null);
      } catch {
        showToast("Failed to load reminder settings", "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showToast]);

  const save = async (): Promise<void> => {
    if (!profile) return;
    if (guest || isGuestSession()) {
      showToast("Sign in to save reminder settings");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/patient-profiles/${profile.id}`, {
        method: "PUT",
        body: {
          reminderPrefEmail: profile.reminderPrefEmail,
          reminderPrefSms: profile.reminderPrefSms,
          reminderPrefApp: profile.reminderPrefApp,
          reminderFrequency: profile.reminderFrequency ?? "DAY_BEFORE",
          quietHoursStart: profile.quietHoursStart ?? null,
          quietHoursEnd: profile.quietHoursEnd ?? null
        }
      });
      showToast("Reminder settings saved");
      void apiRequest("/analytics/events", {
        method: "POST",
        body: { name: "reminder_preference_updated", resourceType: "PatientProfile", resourceId: profile.id }
      }).catch(() => undefined);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRolePage allowedRoles={["PATIENT"]}>
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      </ProtectedRolePage>
    );
  }

  if (!profile) {
    return (
      <ProtectedRolePage allowedRoles={["PATIENT"]}>
        <p className="text-sm text-slate-500">Profile not found.</p>
      </ProtectedRolePage>
    );
  }

  const frequency = profile.reminderFrequency ?? "DAY_BEFORE";

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-8 flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-brand-50 p-2 text-brand-700">
          <IconBell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reminder settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose how often you want appointment reminders, and which channels to use.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">How often</h2>
          <p className="mt-1 text-xs text-slate-500">Pick one schedule. You can change it anytime.</p>
          <div className="mt-4 space-y-3" role="radiogroup" aria-label="Reminder frequency">
            {FREQUENCY_OPTIONS.map((option) => {
              const selected = frequency === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setProfile({ ...profile, reminderFrequency: option.value })}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{option.title}</span>
                    <span
                      className={cn(
                        "h-4 w-4 rounded-full border-2",
                        selected ? "border-brand-600 bg-brand-600" : "border-slate-300"
                      )}
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
          <p className="mt-1 text-xs text-slate-500">
            SMS and in-app use placeholders until provider keys are configured.
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.reminderPrefEmail ?? true}
                onChange={(e) => setProfile({ ...profile, reminderPrefEmail: e.target.checked })}
              />
              Email reminders
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.reminderPrefSms ?? false}
                onChange={(e) => setProfile({ ...profile, reminderPrefSms: e.target.checked })}
              />
              SMS reminders (placeholder)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.reminderPrefApp ?? true}
                onChange={(e) => setProfile({ ...profile, reminderPrefApp: e.target.checked })}
              />
              In-app notifications (placeholder)
            </label>
          </div>

          <h3 className="mt-6 text-sm font-semibold text-slate-900">Quiet hours</h3>
          <p className="mt-1 text-xs text-slate-500">
            Suppress non-urgent reminders overnight. Leave blank to allow anytime.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="text-sm text-slate-700">
              Start
              <select
                className="ml-2"
                value={profile.quietHoursStart ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    quietHoursStart: e.target.value === "" ? null : Number(e.target.value)
                  })
                }
              >
                <option value="">Off</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              End
              <select
                className="ml-2"
                value={profile.quietHoursEnd ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    quietHoursEnd: e.target.value === "" ? null : Number(e.target.value)
                  })
                }
              >
                <option value="">Off</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button type="button" className="btn-primary mt-6" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving..." : "Save reminder settings"}
          </button>

          <p className="mt-4 text-xs text-slate-500">
            Contact details come from your{" "}
            <Link href="/patient/profile" className="text-brand-700 underline">
              profile
            </Link>
            .
          </p>
        </section>
      </div>
    </ProtectedRolePage>
  );
}
