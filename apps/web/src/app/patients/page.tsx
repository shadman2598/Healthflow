"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PatientTable, type PatientRow } from "../../components/healthflow/PatientTable";
import { IconPlus } from "../../components/ui/Icons";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";

export default function HealthFlowPatientsPage() {
  const { showToast } = useToast();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (sort) params.set("sort", sort);
      const res = await apiRequest<{ profiles: PatientRow[] }>(
        `/patient-profiles?${params.toString()}`
      );
      setPatients(res.profiles);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to load patients", "error");
    } finally {
      setLoading(false);
    }
  }, [search, showToast, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500">Search, sort, and manage clinic patient records.</p>
        </div>
        <Link href="/patients/new" className="btn-primary inline-flex items-center gap-2 self-start">
          <IconPlus className="h-4 w-4" />
          Add patient
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="w-full sm:max-w-md"
          placeholder="Search name, phone, email, or healthcare number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="w-full sm:w-52" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Alphabetical A–Z</option>
          <option value="visits">Most visits</option>
          <option value="recent">Recent appointment</option>
          <option value="upcoming">Upcoming appointment</option>
          <option value="newest">Newest patient</option>
        </select>
      </div>

      <PatientTable patients={patients} loading={loading} />
    </div>
  );
}
