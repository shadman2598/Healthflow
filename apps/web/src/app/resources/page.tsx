"use client";

import { useEffect, useState } from "react";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconPhone, IconSearch } from "../../components/ui/Icons";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";
import type { ResourceResult } from "../../types/healthflow";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const searchSchema = z.object({
  postalCode: z.string().min(3),
  category: z.string().min(1)
});

type SearchForm = z.infer<typeof searchSchema>;

export default function ResourcesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<ResourceResult[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [integrationNote, setIntegrationNote] = useState("");
  const [searched, setSearched] = useState(false);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<SearchForm>({
    resolver: zodResolver(searchSchema),
    defaultValues: { postalCode: "", category: "Dentist" }
  });

  useEffect(() => {
    apiRequest<{ categories: string[] }>("/resources/categories")
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([
        "Dentist", "Chiropractor", "Massage therapy", "Physiotherapy", "Pharmacy",
        "Walk-in clinic", "Laboratory", "Imaging/x-ray", "Mental health support",
        "Specialist referral resources", "Prescription-related resources"
      ]));
  }, []);

  const onSubmit = async (data: SearchForm): Promise<void> => {
    try {
      const res = await apiRequest<{ results: ResourceResult[]; disclaimer: string; integrationNote?: string }>("/resources/search", {
        method: "POST",
        body: data
      });
      setResults(res.results);
      setDisclaimer(res.disclaimer);
      setIntegrationNote(res.integrationNote ?? "");
      setSearched(true);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Search failed", "error");
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Resource Finder</h1>
        <p className="mt-1 text-sm text-slate-500">Find nearby health-related resources by postal code</p>
      </div>

      <form className="card mb-8 grid gap-4 p-6 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="label">Postal code</label>
          <Input placeholder="M5V 1J2" {...register("postalCode")} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="w-full" {...register("category")}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isSubmitting}>
            <IconSearch className="h-4 w-4" />
            {isSubmitting ? "Searching..." : "Search"}
          </Button>
        </div>
      </form>

      {searched && results.length === 0 ? (
        <EmptyState icon={<IconSearch className="h-10 w-10" />} title="No results" description="Try a different postal code or category." />
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-4">
          {results.map((r) => (
            <div key={r.name} className="card p-5">
              <h3 className="font-semibold text-slate-900">{r.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{r.address}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><IconPhone className="h-3.5 w-3.5" />{r.phone}</span>
                <span>{r.distance}</span>
                <a href={r.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{r.website}</a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {disclaimer ? <p className="mt-6 text-xs text-slate-500">{disclaimer}</p> : null}
      {integrationNote ? <p className="mt-2 text-xs text-slate-400">{integrationNote}</p> : null}
    </ProtectedRolePage>
  );
}
