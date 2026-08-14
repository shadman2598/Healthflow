import {
  resolvePatientNextStep,
  VISIT_REQUEST_DRAFT_PATH,
  type JourneyAppointment,
  type JourneyStep,
  type JourneyThread
} from "@technovate/shared";

export type { JourneyAppointment, JourneyStep, JourneyThread };
export { resolvePatientNextStep, VISIT_REQUEST_DRAFT_PATH };

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
