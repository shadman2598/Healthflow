/**
 * Patient Care Guide — inspired by Ada/Buoy care navigation and MyChart visit prep.
 * Rule-based only. Not a diagnosis engine and not a medical device.
 */

export type UrgencyLevel = "emergency" | "urgent" | "schedule" | "message" | "self_care";

export type CarePathway = {
  id: string;
  title: string;
  summary: string;
  questions: { id: string; prompt: string; yesMeans: UrgencyLevel | "continue" }[];
  defaultOutcome: UrgencyLevel;
  tips: string[];
};

export type CareOutcome = {
  level: UrgencyLevel;
  title: string;
  body: string;
  actions: { label: string; href: string; primary?: boolean }[];
};

export const CARE_DISCLAIMER =
  "This guide helps you decide how to use the clinic portal. It is not a diagnosis, not medical advice, and not a substitute for a clinician. If you think you are having an emergency, call local emergency services now.";

export const CARE_PATHWAYS: CarePathway[] = [
  {
    id: "chest-breathing",
    title: "Chest pain or trouble breathing",
    summary: "Sudden chest pressure, shortness of breath, or severe breathing issues.",
    questions: [
      {
        id: "severe",
        prompt: "Is the pain severe, crushing, or spreading to your arm, jaw, or back?",
        yesMeans: "emergency"
      },
      {
        id: "breathing",
        prompt: "Are you struggling to breathe, turning blue, or feeling faint?",
        yesMeans: "emergency"
      }
    ],
    defaultOutcome: "urgent",
    tips: ["Do not drive yourself if symptoms are severe.", "Bring a list of medications if you go to urgent or emergency care."]
  },
  {
    id: "fever-illness",
    title: "Fever, cold, or flu-like illness",
    summary: "Fever, cough, sore throat, body aches, or congestion.",
    questions: [
      {
        id: "red-flags",
        prompt: "Do you have a stiff neck, confusion, purple rash, or trouble breathing?",
        yesMeans: "emergency"
      },
      {
        id: "high-risk",
        prompt: "Are you immunocompromised, pregnant, or has fever lasted more than 3 days?",
        yesMeans: "schedule"
      }
    ],
    defaultOutcome: "self_care",
    tips: ["Rest, fluids, and over-the-counter fever reducers may help mild illness.", "Message the clinic if symptoms worsen or you need a work/school note."]
  },
  {
    id: "injury",
    title: "Sprain, cut, or minor injury",
    summary: "Twists, falls, cuts, or sports-related injuries.",
    questions: [
      {
        id: "open-fracture",
        prompt: "Is there heavy bleeding, bone visibly out of place, or loss of feeling?",
        yesMeans: "emergency"
      },
      {
        id: "cant-bear",
        prompt: "Can you not put weight on the limb or is the joint badly swollen/deformed?",
        yesMeans: "urgent"
      }
    ],
    defaultOutcome: "schedule",
    tips: ["RICE (rest, ice, compression, elevation) can help mild sprains.", "Walk-in clinics can often assess same-day minor injuries."]
  },
  {
    id: "meds-refill",
    title: "Medication refill or side effects",
    summary: "Need a refill, dose question, or mild side effect concern.",
    questions: [
      {
        id: "severe-reaction",
        prompt: "Are you having swelling of the face/tongue, trouble breathing, or a severe reaction?",
        yesMeans: "emergency"
      },
      {
        id: "out-of-meds",
        prompt: "Are you completely out of a critical medication (e.g. insulin, heart meds)?",
        yesMeans: "urgent"
      }
    ],
    defaultOutcome: "message",
    tips: ["Stable refill requests can often be handled by message.", "Prescription refill without a visit may have a clinic fee — check Fees & Resources."]
  },
  {
    id: "forms-notes",
    title: "Sick note, forms, or paperwork",
    summary: "Work/school notes, insurance forms, records, or letters.",
    questions: [
      {
        id: "urgent-form",
        prompt: "Do you need this completed within 24 hours for work, school, or travel?",
        yesMeans: "message"
      }
    ],
    defaultOutcome: "message",
    tips: [
      "A standard sick note at this clinic is $50 (uninsured).",
      "Open Fees & Resources for the full list before you request paperwork."
    ]
  },
  {
    id: "mental-health",
    title: "Stress, anxiety, or low mood",
    summary: "Feeling overwhelmed, anxious, or down and looking for next steps.",
    questions: [
      {
        id: "crisis",
        prompt: "Are you thinking about harming yourself or others, or feel unsafe right now?",
        yesMeans: "emergency"
      }
    ],
    defaultOutcome: "schedule",
    tips: [
      "In Canada you can call or text 9-8-8 for suicide crisis support.",
      "You can also message the clinic to request a mental health appointment."
    ]
  },
  {
    id: "follow-up",
    title: "Follow-up or routine checkup",
    summary: "Results review, chronic condition follow-up, or annual checkup.",
    questions: [],
    defaultOutcome: "schedule",
    tips: ["Use Calendar or Appointment History to review upcoming visits.", "Prepare questions ahead of time with Visit prep."]
  }
];

const OUTCOMES: Record<UrgencyLevel, Omit<CareOutcome, "actions"> & { actionBuilder: () => CareOutcome["actions"] }> = {
  emergency: {
    level: "emergency",
    title: "Seek emergency care now",
    body: "Your answers suggest this may need emergency assessment. Call local emergency services or go to the nearest emergency department. Do not wait for a clinic message reply.",
    actionBuilder: () => [
      { label: "Find nearby walk-in / urgent care", href: "/resources?tab=finder", primary: true },
      { label: "Message clinic (non-emergency only)", href: "/messages" }
    ]
  },
  urgent: {
    level: "urgent",
    title: "Same-day or urgent assessment recommended",
    body: "Consider a walk-in clinic, urgent care, or calling the clinic today. If symptoms suddenly worsen, treat it as an emergency.",
    actionBuilder: () => [
      { label: "Find nearby care", href: "/resources?tab=finder", primary: true },
      { label: "Message the clinic", href: "/messages" },
      { label: "View appointments", href: "/patient/appointments" }
    ]
  },
  schedule: {
    level: "schedule",
    title: "Book or wait for a clinic visit",
    body: "A scheduled visit with your clinic is a reasonable next step. You can also message reception about availability.",
    actionBuilder: () => [
      { label: "Open calendar", href: "/calendar", primary: true },
      { label: "Message clinic", href: "/messages" },
      { label: "Prepare for a visit", href: "/patient/care-guide?tab=prep" }
    ]
  },
  message: {
    level: "message",
    title: "Message the clinic",
    body: "This can often be handled through secure messaging (refills, forms, non-urgent questions). Include clear details and any deadlines.",
    actionBuilder: () => [
      { label: "Start a message", href: "/messages", primary: true },
      { label: "Check clinic fees", href: "/resources" },
      { label: "FAQ", href: "/faq" }
    ]
  },
  self_care: {
    level: "self_care",
    title: "Self-care may be enough for now",
    body: "Mild symptoms often improve with rest and home care. Message the clinic or book a visit if things get worse, last longer than expected, or you are unsure.",
    actionBuilder: () => [
      { label: "Message if it worsens", href: "/messages", primary: true },
      { label: "Find pharmacy nearby", href: "/resources?tab=finder" },
      { label: "Read FAQ", href: "/faq" }
    ]
  }
};

export function resolveCareOutcome(pathway: CarePathway, answers: Record<string, boolean>): CareOutcome {
  for (const q of pathway.questions) {
    if (answers[q.id] === true && q.yesMeans !== "continue") {
      const base = OUTCOMES[q.yesMeans];
      return { ...base, actions: base.actionBuilder() };
    }
  }
  const base = OUTCOMES[pathway.defaultOutcome];
  return { ...base, actions: base.actionBuilder() };
}

export type VisitPrepItem = { id: string; label: string; detail?: string };

export const VISIT_PREP_BASE: VisitPrepItem[] = [
  { id: "id", label: "Bring photo ID" },
  { id: "insurance", label: "Bring health/insurance card" },
  { id: "meds", label: "List current medications and doses" },
  { id: "questions", label: "Write 2–3 questions for your clinician" },
  { id: "arrive", label: "Plan to arrive 10–15 minutes early" },
  { id: "cancel", label: "Cancel at least 24 hours ahead if you cannot attend (late cancel fee may apply)" }
];

export const VISIT_PREP_BY_CATEGORY: Record<string, VisitPrepItem[]> = {
  CHECKUP: [
    { id: "history", label: "Note any new symptoms since your last visit" },
    { id: "screening", label: "Bring prior screening or lab results if you have them" }
  ],
  FOLLOW_UP: [
    { id: "changes", label: "Track what improved or worsened since last visit" },
    { id: "plan", label: "Bring notes about how well the care plan is working" }
  ],
  MEDICATION: [
    { id: "bottles", label: "Bring medication bottles or a clear photo of labels" },
    { id: "side", label: "List any side effects you noticed" }
  ],
  LAB_REVIEW: [
    { id: "labs", label: "Bring printed or portal lab results if available" },
    { id: "fasting", label: "Confirm whether fasting was required for any tests" }
  ],
  URGENT: [
    { id: "timeline", label: "Write when symptoms started and what makes them better/worse" },
    { id: "er", label: "Go to emergency care instead if symptoms become severe" }
  ],
  CONSULTATION: [
    { id: "goals", label: "Write your top goal for this consultation" },
    { id: "records", label: "Bring relevant records from other clinics" }
  ],
  OTHER: [{ id: "reason", label: "Be ready to explain the main reason for the visit in one sentence" }]
};

export type ClinicAssistHit = {
  id: string;
  kind: "faq" | "fee" | "howto";
  title: string;
  body: string;
  href?: string;
};

const HOWTO_SNIPPETS: ClinicAssistHit[] = [
  {
    id: "howto-message",
    kind: "howto",
    title: "How do I message the clinic?",
    body: "Open Messages, start a new thread, and describe your question. Use Care Guide first if you are unsure whether to message or seek urgent care.",
    href: "/messages"
  },
  {
    id: "howto-reschedule",
    kind: "howto",
    title: "How do I reschedule?",
    body: "Open Appointment History, choose an upcoming visit, then Request reschedule. Reception will follow up.",
    href: "/patient/appointments"
  },
  {
    id: "howto-fees",
    kind: "howto",
    title: "Where do I see costs?",
    body: "Fees & Resources lists common uninsured prices such as sick notes ($50), forms, and no-show fees.",
    href: "/resources"
  },
  {
    id: "howto-nearby",
    kind: "howto",
    title: "How do I find a nearby pharmacy or walk-in?",
    body: "Open Fees & Resources → Nearby map finder, enter your postal code, and pick a category.",
    href: "/resources?tab=finder"
  },
  {
    id: "howto-prep",
    kind: "howto",
    title: "How should I prepare for my visit?",
    body: "Use Visit prep in Care Guide for a checklist tailored to your appointment type.",
    href: "/patient/care-guide?tab=prep"
  }
];

const FAQ_SNIPPETS: ClinicAssistHit[] = [
  {
    id: "faq-sick-note",
    kind: "faq",
    title: "How much does a sick note cost?",
    body: "A standard sick note / work or school absence note is $50 at this clinic.",
    href: "/resources"
  },
  {
    id: "faq-emergency",
    kind: "faq",
    title: "What should I do in an emergency?",
    body: "This app is not for emergencies. Call local emergency services immediately.",
    href: "/faq"
  },
  {
    id: "faq-privacy",
    kind: "faq",
    title: "Who can see my information?",
    body: "Patients see only their own records. Staff see clinic patients they manage. Internal staff notes are never shown to patients.",
    href: "/faq"
  }
];

export function searchClinicAssistant(query: string, feeHits: ClinicAssistHit[] = []): ClinicAssistHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...HOWTO_SNIPPETS.slice(0, 4), ...FAQ_SNIPPETS.slice(0, 2)];

  const pool = [...HOWTO_SNIPPETS, ...FAQ_SNIPPETS, ...feeHits];
  const scored = pool
    .map((item) => {
      const hay = `${item.title} ${item.body}`.toLowerCase();
      let score = 0;
      for (const token of q.split(/\s+/).filter(Boolean)) {
        if (hay.includes(token)) score += 1;
      }
      if (hay.includes(q)) score += 3;
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((row) => row.item);

  return scored.length > 0 ? scored : HOWTO_SNIPPETS.slice(0, 3);
}

export function urgencyStyles(level: UrgencyLevel): { badge: string; panel: string } {
  switch (level) {
    case "emergency":
      return { badge: "bg-red-100 text-red-800", panel: "border-red-200 bg-red-50" };
    case "urgent":
      return { badge: "bg-amber-100 text-amber-900", panel: "border-amber-200 bg-amber-50" };
    case "schedule":
      return { badge: "bg-brand-100 text-brand-800", panel: "border-brand-200 bg-brand-50" };
    case "message":
      return { badge: "bg-teal-100 text-teal-800", panel: "border-teal-200 bg-teal-50" };
    default:
      return { badge: "bg-slate-100 text-slate-700", panel: "border-slate-200 bg-slate-50" };
  }
}
