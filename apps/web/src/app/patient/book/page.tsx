"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DATA_USE_WAIVER, DATA_USE_WAIVER_TITLE, PATIENT_NEEDS, needById } from "@technovate/shared";
import { ProtectedRolePage } from "../../../components/healthflow/ProtectedRolePage";
import { ApiError, apiRequest } from "../../../lib/api";
import { isGuestSession } from "../../../lib/guest-session";
import { useToast } from "../../../contexts/toast-context";
import type { HealthFlowAppointment } from "../../../types/healthflow";

export default function BookVisitPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [needId, setNeedId] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon">("morning");
  const [detail, setDetail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const need = needId ? needById(needId) : undefined;

  const onPlace = (): void => {
    if (!need?.placeQuery) return;
    router.push(`/resources?tab=finder&category=${encodeURIComponent(need.placeQuery)}`);
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!need || need.kind !== "visit") return;
    if (isGuestSession()) {
      showToast("Sign in first. Then we can put the visit on the real calendar.", "error");
      router.push("/signup/patient");
      return;
    }
    if (!consent) {
      showToast("Please agree to the information waiver.", "error");
      return;
    }
    if (!day) {
      showToast("Pick a day.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ appointment: HealthFlowAppointment; message: string }>(
        "/appointments/simple",
        {
          method: "POST",
          body: {
            need: need.id,
            needDetail: need.id === "other" ? detail : undefined,
            day,
            timeOfDay,
            dataUseConsent: true
          }
        }
      );
      showToast(res.message ?? "Visit booked.");
      router.replace("/patient/visits");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Booking failed. Your visit was not added.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRolePage allowedRoles={["PATIENT"]}>
      <h1 className="text-3xl font-bold text-slate-900">Book a visit</h1>
      <p className="mt-2 max-w-xl text-lg text-slate-600">
        Tell us what you need. For a checkup, we only ask for a day and morning or afternoon.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {PATIENT_NEEDS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setNeedId(item.id)}
              className={`min-h-16 w-full rounded-2xl border px-4 py-4 text-left text-lg font-semibold ${
                needId === item.id
                  ? "border-teal-600 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-white text-slate-900"
              }`}
            >
              {item.label}
              <span className="mt-1 block text-sm font-normal text-slate-600">{item.whatHappens}</span>
            </button>
          </li>
        ))}
      </ul>

      {need?.kind === "place" ? (
        <div className="mt-8">
          <button type="button" className="btn-primary text-lg" onClick={onPlace}>
            Show me nearby places
          </button>
        </div>
      ) : null}

      {need?.kind === "visit" ? (
        <form className="mt-8 max-w-lg space-y-5" onSubmit={(e) => void onSubmit(e)}>
          {need.id === "other" ? (
            <div>
              <label htmlFor="need-detail" className="label text-base">
                What do you need? Use simple words.
              </label>
              <input
                id="need-detail"
                required
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="w-full min-h-12 text-lg"
                placeholder="Example: I need a sick note"
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="visit-day" className="label text-base">
              Which day?
            </label>
            <input
              id="visit-day"
              type="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full min-h-12 text-lg"
            />
          </div>
          <fieldset>
            <legend className="label text-base">Morning or afternoon?</legend>
            <div className="mt-2 flex gap-3">
              {(["morning", "afternoon"] as const).map((part) => (
                <label
                  key={part}
                  className={`flex min-h-12 flex-1 items-center justify-center rounded-xl border px-3 text-lg ${
                    timeOfDay === part ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="timeOfDay"
                    className="sr-only"
                    checked={timeOfDay === part}
                    onChange={() => setTimeOfDay(part)}
                  />
                  {part === "morning" ? "Morning" : "Afternoon"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span className="text-base text-slate-700">
              <strong>{DATA_USE_WAIVER_TITLE}.</strong> {DATA_USE_WAIVER}
            </span>
          </label>
          <button type="submit" disabled={loading} className="btn-primary w-full text-lg">
            {loading ? "Saving…" : "Put it on the calendar"}
          </button>
        </form>
      ) : null}
    </ProtectedRolePage>
  );
}
