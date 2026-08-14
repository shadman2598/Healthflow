"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { SecureFieldReveal } from "../../../components/healthflow/SecureFieldReveal";
import { TrustBanner } from "../../../components/healthflow/TrustBanner";
import { ApiError, apiRequest } from "../../../lib/api";
import { isGuestSession } from "../../../lib/guest-session";
import { useToast } from "../../../contexts/toast-context";

type PatientProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  healthcareNumber: string;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  address?: string | null;
  reminderPrefEmail?: boolean;
  reminderPrefSms?: boolean;
  reminderPrefApp?: boolean;
  reminderFrequency?: "DAY_BEFORE" | "WEEKLY" | "EVERY_DAY";
};

export default function PatientProfilePage() {
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
            firstName: GUEST_USER.patientProfile!.firstName,
            lastName: GUEST_USER.patientProfile!.lastName,
            email: GUEST_USER.email,
            phone: GUEST_USER.patientProfile!.phone || "Not set",
            healthcareNumber: "••••••GUEST",
            dateOfBirth: null,
            reminderPrefEmail: true,
            reminderPrefSms: false,
            reminderPrefApp: true
          });
          return;
        }
        const res = await apiRequest<{ profiles: PatientProfile[] }>("/patient-profiles");
        setProfile(res.profiles[0] ?? null);
      } catch {
        showToast("Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showToast]);

  const savePreferences = async (): Promise<void> => {
    if (!profile) return;
    if (guest || isGuestSession()) {
      showToast("Sign in to save reminder preferences");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/patient-profiles/${profile.id}`, {
        method: "PUT",
        body: {
          reminderPrefEmail: profile.reminderPrefEmail,
          reminderPrefSms: profile.reminderPrefSms,
          reminderPrefApp: profile.reminderPrefApp
        }
      });
      showToast("Reminder preferences saved");
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

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Your contact information and reminder preferences</p>
      </div>

      <TrustBanner context="profile" className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Basic information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium">
                {profile.firstName} {profile.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd>{profile.phone}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Healthcare number</dt>
              <dd className="mt-1">
                {guest ? (
                  <span className="font-mono text-sm text-slate-700">{profile.healthcareNumber}</span>
                ) : (
                  <SecureFieldReveal profileId={profile.id} maskedValue={profile.healthcareNumber} />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Date of birth</dt>
              <dd>{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Height / Weight</dt>
              <dd>
                {profile.heightCm ?? "—"} cm / {profile.weightKg ?? "—"} kg
              </dd>
            </div>
          </dl>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">Reminder preferences</h2>
          <p className="mt-1 text-xs text-slate-500">
            Channel toggles live here. For daily / weekly / day-before schedules, open{" "}
            <Link href="/patient/reminders" className="text-brand-700 underline">
              Reminder settings
            </Link>
            .
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
          <p className="mt-3 text-sm text-slate-600">
            Current schedule:{" "}
            <span className="font-medium text-slate-900">
              {profile.reminderFrequency === "EVERY_DAY"
                ? "Every day"
                : profile.reminderFrequency === "WEEKLY"
                  ? "Once a week"
                  : "Day before appointment"}
            </span>
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void savePreferences()}>
              {saving ? "Saving..." : "Save preferences"}
            </button>
            <Link href="/patient/reminders" className="btn-secondary">
              Manage schedule
            </Link>
          </div>
        </section>
      </div>
    </ProtectedRolePage>
  );
}
