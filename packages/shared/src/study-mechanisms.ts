/**
 * Prompt 1 — applications worth studying, as product canon.
 * Steal mechanisms, never copy products. HealthFlow combines the core set.
 */

export type StudyPriority = "core" | "selective" | "defer";

export type StudyProduct = {
  id: string;
  product: string;
  strength: string;
  mechanism: string;
  antiPattern: string;
  healthflowTake: string;
  priority: StudyPriority;
};

export type CombinedMechanism = {
  id: string;
  mechanism: string;
  learnedFrom: string;
  /** In-app route that currently embodies this mechanism. */
  href: string;
  cta: string;
  guestFriendly: boolean;
};

export const STUDY_PRODUCTS: StudyProduct[] = [
  {
    id: "epic-mychart",
    product: "Epic / MyChart",
    strength: "Infrastructure + patient portal",
    mechanism: "Become the system of record for the visit loop; trust via institutional embedding",
    antiPattern: "Boil-the-ocean EHR; multi-year install sales",
    healthflowTake:
      "Own clinic workflow truth (appointments, messages, reminders, audit) with portal-grade trust",
    priority: "core"
  },
  {
    id: "zocdoc",
    product: "Zocdoc",
    strength: "Discovery + scheduling",
    mechanism: "Collapse find → availability → book into one low-friction path",
    antiPattern: "Marketplace cold-start before clinic value exists",
    healthflowTake: "Frictionless book / reschedule / cancel inside a known clinic; conflict-aware slots",
    priority: "core"
  },
  {
    id: "teladoc",
    product: "Teladoc",
    strength: "Virtual care access",
    mechanism: "Access + convenience through a ready provider network and simple entry",
    antiPattern: "Build a video care network as MVP",
    healthflowTake: "Message the clinic team and see the next action — not a telehealth marketplace",
    priority: "selective"
  },
  {
    id: "goodrx",
    product: "GoodRx",
    strength: "Medication affordability",
    mechanism: "Immediate, tangible value at the decision moment",
    antiPattern: "Pharmacy coupon marketplace",
    healthflowTake: "Fee transparency before a request or cancel — value felt before the form submits",
    priority: "core"
  },
  {
    id: "doximity",
    product: "Doximity",
    strength: "Clinician network",
    mechanism: "Professional network effects and identity among clinicians",
    antiPattern: "Social network for doctors",
    healthflowTake: "Clinician cockpit as a daily work surface; multi-clinic network later",
    priority: "defer"
  },
  {
    id: "apple-health",
    product: "Fitbit / Apple Health",
    strength: "Health data aggregation",
    mechanism: "Continuous engagement via a single health graph",
    antiPattern: "Wearable / PHR aggregator race",
    healthflowTake: "Aggregate the clinic journey (prep, visits, reminders), not biometric streams",
    priority: "selective"
  },
  {
    id: "dexcom",
    product: "Dexcom",
    strength: "Continuous monitoring",
    mechanism: "Real-time feedback loops with clinical utility (alert → act)",
    antiPattern: "Medical device / CGM product",
    healthflowTake: "Operational real-time: reminders, check-in queue, no-show risk — not vitals",
    priority: "selective"
  },
  {
    id: "noom",
    product: "Noom",
    strength: "Behavior change",
    mechanism: "Personalization + structured programs that create habit loops",
    antiPattern: "Coaching / weight-loss program brand",
    healthflowTake: "Visit prep and reminder cadence by preference — not a curriculum",
    priority: "selective"
  },
  {
    id: "calm",
    product: "Calm / Headspace",
    strength: "Mental wellness habit UX",
    mechanism: "Consumer-grade habit formation with low cognitive load",
    antiPattern: "Wellness content library",
    healthflowTake: "Patient UX stays simple; the habit is show up / prep / respond",
    priority: "selective"
  },
  {
    id: "athena",
    product: "Athenahealth / EHRs",
    strength: "Practice infrastructure",
    mechanism: "Administrative workflow depth + lock-in through daily ops",
    antiPattern: "Full practice management + billing suite on day one",
    healthflowTake: "Front Desk OS + clinician cockpit + audit = lock-in through ops, not claims",
    priority: "core"
  }
];

export const COMBINED_MECHANISMS: CombinedMechanism[] = [
  {
    id: "trust-sor",
    mechanism: "Workflow system of record + trust",
    learnedFrom: "Epic / MyChart",
    href: "/patient/dashboard",
    cta: "Open patient next step",
    guestFriendly: true
  },
  {
    id: "scheduling",
    mechanism: "Frictionless scheduling path",
    learnedFrom: "Zocdoc",
    href: "/calendar",
    cta: "Open clinic calendar",
    guestFriendly: true
  },
  {
    id: "tangible-value",
    mechanism: "Tangible value at decision time",
    learnedFrom: "GoodRx",
    href: "/resources",
    cta: "See clinic fees",
    guestFriendly: true
  },
  {
    id: "ops-lockin",
    mechanism: "Daily ops as the operating system",
    learnedFrom: "Athena / EHR practice OS",
    href: "/login/receptionist",
    cta: "Reception sign in",
    guestFriendly: false
  },
  {
    id: "clinician-time",
    mechanism: "Clinician cockpit, not a social network",
    learnedFrom: "Doximity (what not to copy) + Epic (what to learn)",
    href: "/login/doctor",
    cta: "Clinician sign in",
    guestFriendly: false
  },
  {
    id: "structured-prep",
    mechanism: "Structured engagement without entertainment",
    learnedFrom: "Noom + Calm UX bar",
    href: "/patient/care-guide",
    cta: "Open Care Guide",
    guestFriendly: true
  }
];

export const STUDY_NON_GOALS = [
  "Full EHR / RCM replacement",
  "National provider marketplace",
  "Telehealth network",
  "Wearable / CGM / PHR aggregator",
  "Clinician social network",
  "Wellness content library"
] as const;

export function coreStudyProducts(): StudyProduct[] {
  return STUDY_PRODUCTS.filter((p) => p.priority === "core");
}

export function studyDesignRule(): string {
  return "Do not copy any one product. Combine the strongest mechanisms into one clinic workflow OS.";
}
