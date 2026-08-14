import {
  resolvePatientNextStep,
  VISIT_REQUEST_DRAFT_PATH,
  confirmVisitHref,
  prepVisitHref,
  type JourneyAppointment,
  type JourneyPhase,
  type JourneyStep,
  type JourneyThread
} from "@technovate/shared";

export type { JourneyAppointment, JourneyPhase, JourneyStep, JourneyThread };
export { resolvePatientNextStep, VISIT_REQUEST_DRAFT_PATH, confirmVisitHref, prepVisitHref };

/** localStorage key for visit-prep checklist progress (per browser). */
export const PREP_STORAGE_KEY = "healthflow.visitPrep.v1";

export type PrepProgress = {
  appointmentId?: string;
  checkedIds: string[];
  updatedAt: string;
};

export function loadPrepProgress(): PrepProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PrepProgress;
  } catch {
    return null;
  }
}

export function savePrepProgress(progress: PrepProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(progress));
}

/** Estimate prep completion for journey resolver (0–1). */
export function getLocalPrepProgress(appointmentId?: string, totalItems = 5): number | null {
  const stored = loadPrepProgress();
  if (!stored?.checkedIds?.length) return null;
  if (appointmentId && stored.appointmentId && stored.appointmentId !== appointmentId) return null;
  return Math.min(1, stored.checkedIds.length / Math.max(1, totalItems));
}
