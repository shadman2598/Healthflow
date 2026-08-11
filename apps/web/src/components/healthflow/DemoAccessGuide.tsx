"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_CREDENTIALS, DEMO_INVITE_CODES, SHOW_DEMO_HELP } from "../../lib/demo-credentials";

export function DemoAccessGuide() {
  // Defer until mount so SSR HTML matches the initial client render.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(SHOW_DEMO_HELP);
  }, []);

  if (!visible) return null;

  return (
    <div className="mt-10 rounded-2xl border border-slate-200 bg-white/80 p-6 text-left shadow-sm backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Demo access guide</h2>
      <p className="mt-2 text-sm text-slate-600">
        Use these pre-seeded accounts to sign in. Staff and admin accounts cannot be created without authorization.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 font-medium">Password</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {Object.entries(DEMO_CREDENTIALS).map(([role, cred]) => (
              <tr key={role} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-medium capitalize">{role.toLowerCase()}</td>
                <td className="py-2 pr-4 font-mono text-xs">{cred.email}</td>
                <td className="py-2 font-mono text-xs">{cred.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-800">New staff registration</span> requires a clinic invite code
          (demo: doctor <span className="font-mono">{DEMO_INVITE_CODES.DOCTOR}</span>, receptionist{" "}
          <span className="font-mono">{DEMO_INVITE_CODES.RECEPTIONIST}</span>). Each code is single-use.
        </p>
        <p>
          <span className="font-medium text-slate-800">Administrators</span> sign in only — no public admin sign-up.
          Existing admins can add staff from{" "}
          <Link href="/admin/staff" className="font-medium text-brand-600 hover:text-brand-700">
            Admin → Staff
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
