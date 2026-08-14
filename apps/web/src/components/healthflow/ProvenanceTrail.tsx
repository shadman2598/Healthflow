"use client";

import { provenanceSourceLabel, type DataProvenance } from "@technovate/shared";
import { cn } from "../../lib/utils";

type ProvenanceTrailProps = {
  rows: DataProvenance[];
  className?: string;
  title?: string;
};

/**
 * Shows where facts came from — never ask users to re-enter without showing prior source.
 */
export function ProvenanceTrail({
  rows,
  className,
  title = "Data provenance"
}: ProvenanceTrailProps) {
  if (rows.length === 0) {
    return (
      <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)} aria-label={title}>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">No provenance rows for this context yet.</p>
      </section>
    );
  }

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4", className)} aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">
        Where · when · who · source type — clinically important fields are not silently overwritten.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={`${row.field}-${row.collectedAt}-${row.valueSummary}`} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <p className="font-medium text-slate-900">{row.field}</p>
            <p className="text-slate-600">{row.valueSummary}</p>
            <p className="mt-1 text-xs text-slate-400">
              {provenanceSourceLabel(row.source)}
              {row.actorRole ? ` · ${row.actorRole}` : ""}
              {" · "}
              {new Date(row.collectedAt).toLocaleString()}
              {" · "}
              {row.resourceType}/{row.resourceId}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
