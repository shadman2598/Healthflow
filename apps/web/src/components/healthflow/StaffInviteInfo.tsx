"use client";

import Link from "next/link";
import { DEMO_INVITE_CODES, SHOW_DEMO_HELP } from "../../lib/demo-credentials";

type StaffInviteInfoProps = {
  role: "DOCTOR" | "RECEPTIONIST";
  className?: string;
};

export function StaffInviteInfo({ role, className = "" }: StaffInviteInfoProps) {
  const roleLabel = role === "DOCTOR" ? "doctor" : "receptionist";
  const demoCode = DEMO_INVITE_CODES[role];

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
      <p className="text-sm font-medium text-slate-900">Why is an invite code required?</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)} accounts are not open to the public. Your clinic
        administrator issues a one-time invite code so only authorized staff can register.
      </p>
      <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600">
        <li>Ask your clinic admin for a code, or sign in if you already have an account.</li>
        <li>Admin accounts cannot be self-registered — they are created by your organization.</li>
        <li>Patients register separately and cannot access staff portals.</li>
      </ul>
      {SHOW_DEMO_HELP ? (
        <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <span className="font-medium">Demo invite code:</span>{" "}
          <span className="font-mono">{demoCode}</span>
          <span className="mt-1 block text-xs text-brand-700">
            Each code works once. Re-run <span className="font-mono">npm run db:seed</span> to reset demo codes.
          </span>
        </p>
      ) : null}
      <p className="mt-3 text-sm text-slate-600">
        Already registered?{" "}
        <Link
          href={role === "DOCTOR" ? "/login/doctor" : "/login/receptionist"}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Sign in instead
        </Link>
      </p>
    </div>
  );
}
