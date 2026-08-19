"use client";

import { SIMPLE_FAQ } from "@technovate/shared";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { ClinicHelper } from "../../components/healthflow/ClinicHelper";
import { IconShield } from "../../components/ui/Icons";

export default function FaqPage() {
  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "NURSE", "ADMIN", "SUPER_ADMIN"]}>
      <h1 className="text-3xl font-bold text-slate-900">Help</h1>
      <p className="mt-2 max-w-2xl text-lg text-slate-600">
        Short answers. Helper can talk out loud. Helper is not a real doctor.
      </p>

      <div className="mt-6">
        <ClinicHelper />
      </div>

      <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-base text-red-800">
        <strong>If you are very sick right now:</strong> call emergency services. Do not use this app.
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-6">
        {SIMPLE_FAQ.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold text-slate-900">{item.q}</h2>
            <p className="mt-2 text-lg text-slate-700">{item.a}</p>
            <div className="faq-demo mt-4" aria-hidden>
              <div className="faq-demo-step faq-demo-problem">Problem: {item.problem}</div>
              <div className="faq-demo-arrow">then</div>
              <div className="faq-demo-step faq-demo-fix">Fix: {item.fix}</div>
            </div>
          </article>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-slate-500">
        <IconShield className="mr-1 inline h-3.5 w-3.5" />
        This app helps with clinic visits. It does not diagnose or treat.
      </p>
    </ProtectedRolePage>
  );
}
