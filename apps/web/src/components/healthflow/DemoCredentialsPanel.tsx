"use client";

import type { HealthFlowRole } from "../../types/healthflow";
import { getDemoCredential, SHOW_DEMO_HELP } from "../../lib/demo-credentials";

type DemoCredentialsPanelProps = {
  role: HealthFlowRole;
  onUseDemo?: (email: string, password: string) => void;
  className?: string;
};

export function DemoCredentialsPanel({ role, onUseDemo, className = "" }: DemoCredentialsPanelProps) {
  if (!SHOW_DEMO_HELP) return null;

  const demo = getDemoCredential(role);
  if (!demo) return null;

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50/80 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Demo account</p>
      <p className="mt-1 text-sm text-amber-900">
        Use these credentials to sign in as the pre-seeded {demo.label.toLowerCase()}:
      </p>
      <dl className="mt-3 space-y-1.5 text-sm text-amber-950">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium">Email:</dt>
          <dd className="font-mono">{demo.email}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium">Password:</dt>
          <dd className="font-mono">{demo.password}</dd>
        </div>
      </dl>
      {onUseDemo ? (
        <button
          type="button"
          onClick={() => onUseDemo(demo.email, demo.password)}
          className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
        >
          Fill demo credentials
        </button>
      ) : null}
    </div>
  );
}
