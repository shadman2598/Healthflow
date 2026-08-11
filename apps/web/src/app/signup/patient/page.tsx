"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowUser } from "../../../types/healthflow";
import { IconArrowLeft, IconShield } from "../../../components/ui/Icons";

export default function PatientSignupPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    healthcareNumber: "",
    dateOfBirth: "",
    privacyConsent: false
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!form.privacyConsent) {
      showToast("You must accept the privacy policy", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ user: HealthFlowUser }>("/auth/signup/patient", {
        method: "POST",
        body: {
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          healthcareNumber: form.healthcareNumber,
          dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : undefined,
          privacyConsent: true
        }
      });
      showToast("Account created successfully");
      router.replace(res.user.redirectTo ?? "/patient/dashboard");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Signup failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/30 to-teal-50/40 px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <IconArrowLeft className="h-4 w-4" />
          Who are you?
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
            <IconShield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Patient Sign Up</h1>
            <p className="text-sm text-slate-500">Create your HealthFlow patient account</p>
          </div>
        </div>

        <form className="card space-y-4 p-6" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full" />
            </div>
            <div>
              <label className="label">Last name</label>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="label">Healthcare number</label>
            <input required minLength={4} value={form.healthcareNumber} onChange={(e) => setForm({ ...form, healthcareNumber: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="label">Date of birth (optional)</label>
            <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="w-full" />
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(e) => setForm({ ...form, privacyConsent: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-600">
              I consent to HealthFlow collecting and processing my personal health information in accordance with the privacy policy.
            </span>
          </label>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login/patient" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
