"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../lib/zod-resolver";
import { z } from "zod";
import { NearbyMap } from "../../components/healthflow/NearbyMap";
import { ProtectedRolePage } from "../../components/healthflow/ProtectedRolePage";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconPhone, IconSearch, IconShield } from "../../components/ui/Icons";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { CLINIC_FEE_CATEGORIES, CLINIC_FEE_DISCLAIMER } from "../../lib/clinic-fees";
import { RESOURCE_CATEGORIES } from "../../lib/nearby-resources";
import { useToast } from "../../contexts/toast-context";
import type { ResourceResult } from "../../types/healthflow";
import { cn } from "../../lib/utils";

const searchSchema = z.object({
  postalCode: z
    .string()
    .min(3, "Enter a postal code")
    .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/i, "Use a Canadian postal code like M5V 3L9"),
  category: z.string().min(1)
});

type SearchForm = z.infer<typeof searchSchema>;
type TabId = "fees" | "finder";

type SearchResponse = {
  results: ResourceResult[];
  origin?: { lat: number; lon: number; label: string };
  disclaimer?: string;
  integrationNote?: string;
  error?: string;
};

export default function ResourcesPage() {
  return (
    <Suspense
      fallback={
        <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        </ProtectedRolePage>
      }
    >
      <ResourcesContent />
    </Suspense>
  );
}

function ResourcesContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => (searchParams.get("tab") === "finder" ? "finder" : "fees"));
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([...RESOURCE_CATEGORIES]);
  const [results, setResults] = useState<ResourceResult[]>([]);
  const [origin, setOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [integrationNote, setIntegrationNote] = useState("");
  const [searched, setSearched] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<SearchForm>({
    resolver: zodResolver(searchSchema),
    defaultValues: { postalCode: "", category: "Pharmacy" }
  });

  useEffect(() => {
    if (searchParams.get("tab") === "finder") setTab("finder");
    if (searchParams.get("tab") === "fees") setTab("fees");
  }, [searchParams]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_GITHUB_PAGES === "true") {
      setCategories([...RESOURCE_CATEGORIES]);
      return;
    }
    fetch("/api/resources/categories")
      .then((res) => res.json())
      .then((data: { categories?: string[] }) => {
        if (data.categories?.length) setCategories(data.categories);
      })
      .catch(() => setCategories([...RESOURCE_CATEGORIES]));
  }, []);

  const filteredCategories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CLINIC_FEE_CATEGORIES;
    return CLINIC_FEE_CATEGORIES.map((category) => ({
      ...category,
      fees: category.fees.filter(
        (fee) =>
          fee.name.toLowerCase().includes(needle) ||
          fee.description.toLowerCase().includes(needle) ||
          fee.cost.toLowerCase().includes(needle)
      )
    })).filter((category) => category.fees.length > 0);
  }, [query]);

  const onSubmit = async (data: SearchForm): Promise<void> => {
    try {
      let payload: SearchResponse;

      if (process.env.NEXT_PUBLIC_GITHUB_PAGES === "true") {
        // Static GitHub Pages has no Next API routes — search from the browser.
        const { searchNearbyResources } = await import("../../lib/nearby-resources");
        payload = await searchNearbyResources(data.postalCode, data.category);
      } else {
        const response = await fetch("/api/resources/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        payload = (await response.json()) as SearchResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Search failed");
        }
      }

      setResults(payload.results ?? []);
      setOrigin(payload.origin ?? null);
      setDisclaimer(payload.disclaimer ?? "");
      setIntegrationNote(payload.integrationNote ?? "");
      setSearched(true);
      if ((payload.results ?? []).length === 0) {
        showToast("No nearby places found for that category. Try another category or postal code.", "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Search failed", "error");
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT", "RECEPTIONIST", "DOCTOR", "ADMIN", "SUPER_ADMIN"]}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Resources</h1>
        <p className="mt-1 text-sm text-slate-500">
          Clinic fees patients should know about, plus nearby health resources
        </p>
      </div>

      <div className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("fees")}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition",
            tab === "fees" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          Clinic costs & fees
        </button>
        <button
          type="button"
          onClick={() => setTab("finder")}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition",
            tab === "finder" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          )}
        >
          Nearby map finder
        </button>
      </div>

      {tab === "fees" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-teal-100 bg-teal-50/80 p-5">
            <h2 className="text-base font-semibold text-teal-900">What will this cost me?</h2>
            <p className="mt-2 text-sm leading-relaxed text-teal-800/90">
              Many medically necessary visits are covered by provincial health insurance. Notes, forms,
              missed appointments, and some procedures are often <strong>not covered</strong> and are
              billed directly to you. Review these prices before you request something like a sick note.
            </p>
            <p className="mt-3 text-sm font-medium text-teal-900">
              Example: a sick note / work or school absence note is <span className="font-bold">$50</span>.
            </p>
          </div>

          <div className="card p-4">
            <label className="label" htmlFor="fee-search">
              Search fees
            </label>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="fee-search"
                className="pl-9"
                placeholder="Try “sick note”, “records”, “no-show”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredCategories.length === 0 ? (
            <EmptyState
              icon={<IconSearch className="h-10 w-10" />}
              title="No matching fees"
              description="Try another search term, or clear the search to see the full list."
            />
          ) : (
            filteredCategories.map((category) => (
              <section key={category.id} className="card overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-900">{category.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{category.summary}</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {category.fees.map((fee) => (
                    <li
                      key={fee.id}
                      className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{fee.name}</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{fee.description}</p>
                        {fee.notes ? <p className="mt-2 text-xs text-slate-500">{fee.notes}</p> : null}
                      </div>
                      <div className="shrink-0 rounded-lg bg-brand-50 px-3 py-2 text-right sm:min-w-[7.5rem]">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                          Patient cost
                        </p>
                        <p className="text-lg font-bold text-brand-700">{fee.cost}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
            <IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {CLINIC_FEE_DISCLAIMER}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-5">
            <h2 className="text-base font-semibold text-brand-900">Find care near you</h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-900/80">
              Enter your Canadian postal code to find nearby pharmacies, optometrists, physiotherapists,
              blood-test labs, walk-in clinics, hospitals, and more. Places are measured from your
              postal-code centre and ranked by estimated driving distance when available.
            </p>
          </div>

          <form
            className="card grid gap-4 p-6 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={handleSubmit(onSubmit)}
          >
            <div>
              <label className="label">Your postal code</label>
              <Input placeholder="M5V 3L9" {...register("postalCode")} />
              {errors.postalCode ? (
                <p className="mt-1 text-xs text-red-600">{errors.postalCode.message}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Full 6-character Canadian postal code</p>
              )}
            </div>
            <div>
              <label className="label">What do you need?</label>
              <select className="w-full" {...register("category")}>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                <IconSearch className="h-4 w-4" />
                {isSubmitting ? "Measuring nearby..." : "Find closest"}
              </Button>
            </div>
          </form>

          {origin ? (
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-sm font-medium text-slate-900">
                  Map of matches near your postal code
                </p>
                <p className="text-xs text-slate-500">{origin.label}</p>
              </div>
              <NearbyMap origin={origin} results={results} />
            </div>
          ) : null}

          {searched && results.length === 0 ? (
            <EmptyState
              icon={<IconSearch className="h-10 w-10" />}
              title="No nearby results"
              description="Try another category, a nearby postal code, or check the spelling."
            />
          ) : null}

          {results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Showing <strong>{results.length}</strong> closest matches, nearest first.
              </p>
              {results.map((r, index) => (
                <div key={r.id ?? `${r.name}-${index}`} className="card p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          #{index + 1}
                        </span>
                        <h3 className="font-semibold text-slate-900">{r.name}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{r.address}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                          {r.distance}
                        </span>
                        {r.driveMinutes != null ? (
                          <span>~{r.driveMinutes} min drive</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <IconPhone className="h-3.5 w-3.5" />
                          {r.phone}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      {r.directionsUrl ? (
                        <a
                          href={r.directionsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          Get directions
                        </a>
                      ) : null}
                      <div className="flex gap-3 text-sm">
                        {r.mapsUrl ? (
                          <a
                            href={r.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-600 hover:underline"
                          >
                            View on map
                          </a>
                        ) : null}
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-slate-600 hover:underline"
                          >
                            Website
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {disclaimer ? <p className="text-xs text-slate-500">{disclaimer}</p> : null}
          {integrationNote ? <p className="text-xs text-slate-400">{integrationNote}</p> : null}
        </div>
      )}
    </ProtectedRolePage>
  );
}
