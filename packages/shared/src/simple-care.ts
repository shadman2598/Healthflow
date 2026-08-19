/**
 * Simple-care layer — lazy, age-aware, 5-year-old language.
 * Not diagnosis. Helps people book, find places, and understand the app.
 */

export type PatientNeedId =
  | "checkup"
  | "follow_up"
  | "blood_test"
  | "prescription"
  | "chemo"
  | "other";

export type DayPart = "morning" | "afternoon";

export type PatientNeed = {
  id: PatientNeedId;
  /** Short button label. */
  label: string;
  /** What happens if they tap this. */
  whatHappens: string;
  kind: "visit" | "place";
  category?: "CHECKUP" | "FOLLOW_UP" | "OTHER";
  placeQuery?: string;
};

export const PATIENT_NEEDS: PatientNeed[] = [
  {
    id: "checkup",
    label: "I need a checkup",
    whatHappens: "Pick a day. We put it on the clinic calendar.",
    kind: "visit",
    category: "CHECKUP"
  },
  {
    id: "follow_up",
    label: "I already came. I need to come back.",
    whatHappens: "Pick a day for a follow-up visit.",
    kind: "visit",
    category: "FOLLOW_UP"
  },
  {
    id: "blood_test",
    label: "I need a blood test place",
    whatHappens: "We show nearby labs. We do not book the lab for you.",
    kind: "place",
    placeQuery: "Laboratory (blood test)"
  },
  {
    id: "prescription",
    label: "I need a medicine store",
    whatHappens: "We show nearby pharmacies.",
    kind: "place",
    placeQuery: "Pharmacy"
  },
  {
    id: "chemo",
    label: "I need a cancer / chemo centre",
    whatHappens: "We show nearby hospitals and cancer centres.",
    kind: "place",
    placeQuery: "Cancer / chemo centre"
  },
  {
    id: "other",
    label: "Something else",
    whatHappens: "Tell us in a few words. We still try to book a visit.",
    kind: "visit",
    category: "OTHER"
  }
];

export const DATA_USE_WAIVER_TITLE = "Using your information";

export const DATA_USE_WAIVER = `I agree that this clinic app may store my name, birthday, phone, healthcare number, visits, and messages so the clinic can take care of me.

The clinic uses this to book visits, send reminders, and show my history.

This is not for selling my information.

This is not for diagnosing me.

I can ask the clinic to stop.`;

export const HELPER_NAME = "Helper";
export const HELPER_DISCLAIMER =
  "Helper is not a real doctor. Helper cannot say what is wrong with you. Call emergency services if you feel very sick.";

export type HelperReply = {
  id: string;
  match: string[];
  say: string;
};

export const HELPER_REPLIES: HelperReply[] = [
  {
    id: "stuck",
    match: ["stuck", "help", "what do i do", "lost", "confused", "don't know"],
    say: "Look at the big buttons. Tap Home, Book a visit, or Help. If you want a checkup, tap Book a visit."
  },
  {
    id: "book",
    match: ["book", "appointment", "checkup", "visit", "calendar"],
    say: "Tap Book a visit. Tap I need a checkup. Pick a day. Pick morning or afternoon. Done. The clinic sees it too."
  },
  {
    id: "error",
    match: ["error", "broke", "fail", "wrong", "didn't work", "red"],
    say: "Your visit was not cancelled. Try again. If it still fails, tap Message clinic and tell them what you wanted."
  },
  {
    id: "emergency",
    match: ["emergency", "911", "chest", "can't breathe", "dying"],
    say: "If this is an emergency, call local emergency services now. This app cannot help with emergencies."
  },
  {
    id: "fees",
    match: ["cost", "fee", "pay", "money", "price"],
    say: "Tap Find a place, then Fees. You can see prices before you ask for a note."
  },
  {
    id: "history",
    match: ["history", "past", "alert", "reminder", "old visit"],
    say: "Tap My visits. Top is coming soon. Bottom is old visits. Alerts are things you should look at."
  },
  {
    id: "places",
    match: ["pharmacy", "blood", "lab", "chemo", "cancer", "where"],
    say: "Tap Find a place. Type your postal code. Pick blood tests, medicine store, or cancer centre."
  },
  {
    id: "default",
    match: [],
    say: "I can help you use this app. I cannot tell you why you feel sick. Try: book a visit, find a place, or my visits."
  }
];

export type FaqDemo = {
  id: string;
  q: string;
  a: string;
  problem: string;
  fix: string;
};

export const SIMPLE_FAQ: FaqDemo[] = [
  {
    id: "book",
    q: "How do I get a visit?",
    a: "Tap Book a visit. Tap checkup. Pick a day. Pick morning or afternoon. That is all.",
    problem: "Too many screens",
    fix: "Three taps: need, day, time"
  },
  {
    id: "checkup",
    q: "What if I only want a checkup?",
    a: "That is the easy path. We do not ask extra questions.",
    problem: "Long forms",
    fix: "Checkup path asks almost nothing"
  },
  {
    id: "places",
    q: "Where do I get blood tests or medicine?",
    a: "Tap Find a place. We show nearby labs, pharmacies, and cancer centres.",
    problem: "Don't know where to go",
    fix: "Map of nearby places"
  },
  {
    id: "history",
    q: "Where are my old visits and alerts?",
    a: "Tap My visits. Coming-soon visits are on top. Alerts are in a yellow box.",
    problem: "Can't find history",
    fix: "One page: visits + alerts"
  },
  {
    id: "emergency",
    q: "What if I am very sick right now?",
    a: "Do not use this app. Call emergency services.",
    problem: "App is not emergency care",
    fix: "Call for help in real life"
  }
];

export const SENIOR_AGE_YEARS = 65;

export function ageYearsFromDob(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function shouldUseEasyMode(ageYears: number | null, userToggle: boolean | null): boolean {
  if (userToggle === true) return true;
  if (userToggle === false) return false;
  return ageYears !== null && ageYears >= SENIOR_AGE_YEARS;
}

export function replyForHelperQuestion(q: string): HelperReply {
  const n = q.trim().toLowerCase();
  if (!n) return HELPER_REPLIES.find((r) => r.id === "default")!;
  const hit = HELPER_REPLIES.find((r) => r.id !== "default" && r.match.some((m) => n.includes(m)));
  return hit ?? HELPER_REPLIES.find((r) => r.id === "default")!;
}

export function needById(id: string): PatientNeed | undefined {
  return PATIENT_NEEDS.find((n) => n.id === id);
}

export function pickDaypartSlot(
  slots: Array<{ startsAt: string }>,
  timeOfDay: DayPart
): { startsAt: string } | null {
  const filtered = slots.filter((s) => {
    const hour = new Date(s.startsAt).getHours();
    return timeOfDay === "morning" ? hour < 12 : hour >= 12;
  });
  return filtered[0] ?? null;
}

export const SIMPLE_RESOURCE_LABELS: Record<string, string> = {
  Pharmacy: "Medicine store",
  "Optometrist / eye doctor": "Eye doctor",
  Physiotherapy: "Sore muscles / physio",
  "Massage therapy": "Massage",
  Dentist: "Dentist",
  Chiropractor: "Back / neck clinic",
  "Walk-in clinic": "Walk-in clinic",
  "Laboratory (blood test)": "Blood tests",
  "Cancer / chemo centre": "Cancer / chemo centre",
  "Imaging / x-ray": "X-ray / bone pictures",
  "Mental health support": "Feelings / mental health",
  "Family doctor / clinic": "Family clinic",
  "Urgent care / ER": "Urgent care",
  Hospital: "Hospital",
  Audiologist: "Hearing clinic",
  "Medical supply / pharmacy equipment": "Medical supplies"
};

export function simpleResourceLabel(category: string): string {
  return SIMPLE_RESOURCE_LABELS[category] ?? category;
}
