"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COMBINED_MECHANISMS,
  STUDY_NON_GOALS,
  STUDY_PRODUCTS,
  studyDesignRule,
  type CombinedMechanism,
  type StudyPriority
} from "@technovate/shared";
import { startGuestSession } from "../../lib/guest-session";
import { IconShield } from "../../components/ui/Icons";
import { cn } from "../../lib/utils";

function priorityLabel(priority: StudyPriority): string {
  if (priority === "core") return "Combine";
  if (priority === "selective") return "Borrow lightly";
  return "Do not chase";
}

function openMechanism(router: ReturnType<typeof useRouter>, item: CombinedMechanism): void {
  if (item.guestFriendly) {
    startGuestSession();
  }
  router.push(item.href);
}

export default function StudyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
            HealthFlow
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            Back to sign in
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Prompt 1</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Applications worth studying
        </h1>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          Success is not downloads. Each product below succeeded for a different reason. HealthFlow
          copies none of them. It combines the underlying mechanisms into one clinic workflow.
        </p>
        <p className="mt-3 max-w-2xl text-sm font-medium text-slate-800">{studyDesignRule()}</p>

        <section className="mt-10" aria-labelledby="combine-heading">
          <h2 id="combine-heading" className="text-xl font-semibold text-slate-900">
            Combined mechanisms — live in this app
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Guest preview opens patient surfaces. Staff surfaces go to sign in.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {COMBINED_MECHANISMS.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  From {item.learnedFrom}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{item.mechanism}</h3>
                <button
                  type="button"
                  onClick={() => openMechanism(router, item)}
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {item.cta}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="study-heading">
          <h2 id="study-heading" className="text-xl font-semibold text-slate-900">
            Study set
          </h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Healthcare products studied, their mechanism, what not to copy, and HealthFlow take
              </caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Mechanism
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Do not copy
                  </th>
                  <th scope="col" className="px-4 py-3">
                    HealthFlow take
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                {STUDY_PRODUCTS.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      {row.product}
                    </th>
                    <td className="px-4 py-3 text-slate-600">{row.mechanism}</td>
                    <td className="px-4 py-3 text-slate-600">{row.antiPattern}</td>
                    <td className="px-4 py-3 text-slate-600">{row.healthflowTake}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          row.priority === "core" && "bg-teal-50 text-teal-800",
                          row.priority === "selective" && "bg-amber-50 text-amber-800",
                          row.priority === "defer" && "bg-slate-100 text-slate-600"
                        )}
                      >
                        {priorityLabel(row.priority)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="nongoals-heading">
          <h2 id="nongoals-heading" className="text-xl font-semibold text-slate-900">
            Explicit non-goals
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {STUDY_NON_GOALS.map((item) => (
              <li key={item} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-center text-xs text-slate-400">
          <IconShield className="mr-1 inline h-3.5 w-3.5" />
          Clinic workflow only — not diagnosis, emergency care, or a copy of any product above.
        </p>
      </main>
    </div>
  );
}
