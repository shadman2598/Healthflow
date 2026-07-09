"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "../../lib/api";
import { roleDashboardPath } from "../../lib/role-config";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowRole, HealthFlowUser } from "../../types/healthflow";
import { IconArrowLeft, IconShield } from "../ui/Icons";

type RoleLoginCardProps = {
  role: HealthFlowRole;
  title: string;
  subtitle: string;
  defaultEmail?: string;
};

export function RoleLoginCard({ role, title, subtitle, defaultEmail = "" }: RoleLoginCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<{ user: HealthFlowUser }>("/auth/me")
      .then((res) => {
        const path = res.user.redirectTo ?? roleDashboardPath(res.user.role);
        router.replace(path);
      })
      .catch(() => {});
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ user: HealthFlowUser }>("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      const userRole = res.user.role;
      const roleMatches =
        userRole === role ||
        (role === "ADMIN" && (userRole === "ADMIN" || userRole === "SUPER_ADMIN"));
      if (!roleMatches) {
        showToast(`This account is registered as ${userRole.toLowerCase()}`, "error");
        return;
      }
      showToast("Login successful");
      router.replace(res.user.redirectTo ?? roleDashboardPath(res.user.role));
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 items-center justify-center bg-gradient-to-br from-brand-600 to-teal-600 lg:flex">
        <div className="max-w-md px-12 text-white">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <IconShield className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium uppercase tracking-wider text-teal-100">HealthFlow</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">{title}</h1>
          <p className="mt-4 text-base leading-relaxed text-blue-100">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <IconArrowLeft className="h-4 w-4" />
            Who are you?
          </Link>

          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <IconShield className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold">HealthFlow</span>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
                placeholder="Enter your password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {role === "PATIENT" ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              New patient?{" "}
              <Link href="/signup/patient" className="font-medium text-brand-600 hover:text-brand-700">
                Create an account
              </Link>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-slate-500">
              Staff member?{" "}
              <Link
                href={role === "DOCTOR" ? "/signup/doctor" : "/signup/receptionist"}
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                Register with invite code
              </Link>
            </p>
          )}

          <p className="mt-8 text-center text-xs text-slate-400">
            Protected health information &middot; Privacy compliant
          </p>
        </div>
      </div>
    </div>
  );
}
