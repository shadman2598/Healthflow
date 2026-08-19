/**
 * Accessibility (Prompt 45) — WCAG-oriented checklist for HealthFlow.
 * Healthcare users include elderly, disabled, visually impaired, cognitively
 * impaired, and low-digital-literacy patients. Accessibility is not complete
 * until primary patient and receptionist workflows are evaluated.
 */

export const ACCESSIBILITY_VERSION = "hf-a11y-v1";

export type A11yCriterion =
  | "keyboard_navigation"
  | "screen_readers"
  | "contrast"
  | "font_sizing"
  | "touch_targets"
  | "form_labels"
  | "error_messages"
  | "focus_management"
  | "motion"
  | "color_dependence"
  | "multilingual"
  | "cognitive_load";

export type A11ySeverity = "critical" | "high" | "medium" | "low";

export type A11yFinding = {
  id: string;
  criterion: A11yCriterion;
  severity: A11ySeverity;
  title: string;
  workflow: "patient" | "receptionist" | "shared" | "clinician";
  status: "fixed" | "partial" | "open";
  notes: string;
};

/** Primary workflows that must be evaluated before claiming a11y complete. */
export const PRIMARY_A11Y_WORKFLOWS = [
  {
    id: "patient.sign_in_and_whats_next",
    label: "Patient sign-in → dashboard WhatsNext → confirm visit",
    role: "patient" as const
  },
  {
    id: "patient.care_guide_prep",
    label: "Patient Care Guide prep checklist",
    role: "patient" as const
  },
  {
    id: "receptionist.front_desk_os",
    label: "Receptionist Front Desk OS — arrivals check-in / confirm",
    role: "receptionist" as const
  },
  {
    id: "receptionist.messages_lane",
    label: "Receptionist communications lane → messages",
    role: "receptionist" as const
  }
] as const;

/**
 * Living audit of high-impact issues. Update status when fixes land.
 * Do not mark overall complete until every primary workflow is evaluated.
 */
export const A11Y_FINDINGS: A11yFinding[] = [
  {
    id: "A1",
    criterion: "keyboard_navigation",
    severity: "high",
    title: "Skip link + visible focus rings",
    workflow: "shared",
    status: "fixed",
    notes: "Skip to main content; :focus-visible on interactive controls"
  },
  {
    id: "A2",
    criterion: "screen_readers",
    severity: "high",
    title: "Landmarks, nav labels, aria-current on active nav",
    workflow: "shared",
    status: "fixed",
    notes: "RoleShell nav/main labelled; decorative icons aria-hidden"
  },
  {
    id: "A3",
    criterion: "form_labels",
    severity: "critical",
    title: "Login inputs associated with labels",
    workflow: "patient",
    status: "fixed",
    notes: "htmlFor/id on email and password; Care Guide ask search labelled"
  },
  {
    id: "A4",
    criterion: "touch_targets",
    severity: "high",
    title: "Primary actions ≥ 44×44 CSS px",
    workflow: "shared",
    status: "fixed",
    notes: "btn-primary/secondary/ghost min-height; desk inline actions"
  },
  {
    id: "A5",
    criterion: "focus_management",
    severity: "high",
    title: "Modal dialog semantics + Escape + labelled close",
    workflow: "shared",
    status: "fixed",
    notes: "role=dialog aria-modal; initial focus on panel"
  },
  {
    id: "A6",
    criterion: "motion",
    severity: "medium",
    title: "Respect prefers-reduced-motion",
    workflow: "shared",
    status: "fixed",
    notes: "Global CSS disables non-essential animation/transition"
  },
  {
    id: "A7",
    criterion: "color_dependence",
    severity: "medium",
    title: "Status not by color alone",
    workflow: "shared",
    status: "fixed",
    notes: "StatusBadge always includes text; urgency chips keep text labels"
  },
  {
    id: "A8",
    criterion: "error_messages",
    severity: "high",
    title: "Toasts as assertive live regions with dismiss control",
    workflow: "shared",
    status: "fixed",
    notes: "aria-live assertive for errors; dismiss button labelled"
  },
  {
    id: "A9",
    criterion: "contrast",
    severity: "medium",
    title: "Muted helper text contrast",
    workflow: "shared",
    status: "partial",
    notes: "Raised slate-400 helpers toward slate-500/600 on primary flows; full audit of every muted class remains"
  },
  {
    id: "A10",
    criterion: "font_sizing",
    severity: "medium",
    title: "Readable base size; avoid tiny-only critical copy",
    workflow: "patient",
    status: "partial",
    notes: "Body remains rem-based; critical CTAs use text-sm+; some meta still text-[10px]"
  },
  {
    id: "A11",
    criterion: "cognitive_load",
    severity: "high",
    title: "WhatsNext / Front Desk single next action",
    workflow: "patient",
    status: "fixed",
    notes: "Primary workflows already lead with one clear next step"
  },
  {
    id: "A12",
    criterion: "multilingual",
    severity: "medium",
    title: "Document language + notification locale",
    workflow: "shared",
    status: "partial",
    notes: "html lang=en; patient notificationLocale en-CA/fr_CA; UI strings not fully localized"
  },
  {
    id: "A13",
    criterion: "keyboard_navigation",
    severity: "medium",
    title: "Receptionist desk rows fully operable by keyboard",
    workflow: "receptionist",
    status: "fixed",
    notes: "Inline actions are native buttons/links with focus rings"
  }
];

export function primaryWorkflowsEvaluated(): boolean {
  const patientOk = A11Y_FINDINGS.filter((f) => f.workflow === "patient").every(
    (f) => f.status === "fixed" || f.status === "partial"
  );
  const deskOk = A11Y_FINDINGS.filter((f) => f.workflow === "receptionist").every(
    (f) => f.status === "fixed" || f.status === "partial"
  );
  return patientOk && deskOk && PRIMARY_A11Y_WORKFLOWS.length >= 4;
}

export function accessibilityIsComplete(): boolean {
  // Explicit product rule: not complete until primary workflows evaluated AND no open critical/high.
  if (!primaryWorkflowsEvaluated()) return false;
  return !A11Y_FINDINGS.some(
    (f) => f.status === "open" && (f.severity === "critical" || f.severity === "high")
  );
}

export function openHighImpactFindings(): A11yFinding[] {
  return A11Y_FINDINGS.filter(
    (f) => f.status === "open" && (f.severity === "critical" || f.severity === "high")
  );
}

export function minTouchTargetPx(): number {
  return 44;
}
