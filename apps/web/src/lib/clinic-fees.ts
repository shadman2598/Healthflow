export type ClinicFee = {
  id: string;
  name: string;
  cost: string;
  description: string;
  notes?: string;
};

export type ClinicFeeCategory = {
  id: string;
  title: string;
  summary: string;
  fees: ClinicFee[];
};

/**
 * Uninsured / patient-pay clinic fees patients should know about before requesting services.
 * Amounts are illustrative clinic pricing for the demo.
 */
export const CLINIC_FEE_CATEGORIES: ClinicFeeCategory[] = [
  {
    id: "notes-forms",
    title: "Notes & forms",
    summary: "Common paperwork that is not covered by provincial health insurance.",
    fees: [
      {
        id: "sick-note",
        name: "Sick note / work or school absence note",
        cost: "$50",
        description: "A short doctor’s note confirming you were unable to attend work or school.",
        notes: "Usually ready within 1–3 business days after the visit or request."
      },
      {
        id: "back-to-work",
        name: "Return-to-work / fitness-for-duty note",
        cost: "$60",
        description: "Confirmation that you are cleared to return to work or need modified duties."
      },
      {
        id: "school-form",
        name: "School / daycare form",
        cost: "$40–$75",
        description: "Standard forms required by schools, camps, or daycare programs."
      },
      {
        id: "insurance-form",
        name: "Insurance / disability / benefits form",
        cost: "$75–$150",
        description: "Longer forms for private insurance, short-term disability, or benefits claims.",
        notes: "Complex forms may take longer and cost more depending on length."
      },
      {
        id: "drivers-medical",
        name: "Driver’s medical / ministry form",
        cost: "$125",
        description: "Medical assessment and form completion for driver’s licensing requirements."
      },
      {
        id: "travel-cancellation",
        name: "Travel cancellation / insurance letter",
        cost: "$80",
        description: "Letter for travel insurers about medical reasons for trip cancellation."
      }
    ]
  },
  {
    id: "appointments",
    title: "Appointments & missed visits",
    summary: "Charges that can apply when a booked visit is missed or changed late.",
    fees: [
      {
        id: "no-show",
        name: "Missed appointment (no-show)",
        cost: "$45",
        description: "Applied when you miss a booked visit without cancelling in advance.",
        notes: "Cancel at least 24 hours ahead to avoid this fee when possible."
      },
      {
        id: "late-cancel",
        name: "Late cancellation (under 24 hours)",
        cost: "$35",
        description: "Applied when an appointment is cancelled with less than 24 hours’ notice."
      },
      {
        id: "after-hours",
        name: "After-hours / same-day urgent slot",
        cost: "$40",
        description: "Administrative fee for certain same-day or after-hours booking requests.",
        notes: "The medical visit itself may still be insured; this covers clinic admin time."
      }
    ]
  },
  {
    id: "records",
    title: "Records & copies",
    summary: "Fees for copying, transferring, or summarizing your chart.",
    fees: [
      {
        id: "chart-copy",
        name: "Copy of medical records (up to 20 pages)",
        cost: "$30",
        description: "Printed or electronic copy of portions of your chart for personal use."
      },
      {
        id: "chart-extra",
        name: "Additional chart pages",
        cost: "$0.50 / page",
        description: "Per-page charge after the included page allowance."
      },
      {
        id: "transfer-out",
        name: "Transfer of records to another clinic",
        cost: "$40",
        description: "Preparing and sending your chart when you change family doctors."
      },
      {
        id: "summary-letter",
        name: "Chart summary / medical report letter",
        cost: "$90–$175",
        description: "A written summary of your medical history prepared by the physician."
      }
    ]
  },
  {
    id: "prescriptions-admin",
    title: "Prescriptions & admin requests",
    summary: "Requests handled outside a regular booked visit.",
    fees: [
      {
        id: "rx-refill-no-visit",
        name: "Prescription refill without an appointment",
        cost: "$25",
        description: "Renewing a stable medication when no visit is required.",
        notes: "Some renewals still require an appointment for safety."
      },
      {
        id: "form-fax",
        name: "Fax / form transmission to third party",
        cost: "$15",
        description: "Sending completed forms or notes to employers, schools, or insurers."
      },
      {
        id: "priority-completion",
        name: "Priority / rush form completion",
        cost: "+$25",
        description: "Expedited turnaround when available, added on top of the base form fee."
      }
    ]
  },
  {
    id: "procedures",
    title: "Uninsured procedures & services",
    summary: "Services that are commonly not covered and billed directly to patients.",
    fees: [
      {
        id: "wart-removal",
        name: "Wart / skin tag removal (cosmetic)",
        cost: "$75–$150",
        description: "Removal of benign lesions when not medically necessary."
      },
      {
        id: "travel-vaccine-admin",
        name: "Travel vaccine administration",
        cost: "$20–$40",
        description: "Clinic administration fee; vaccine product cost is separate."
      },
      {
        id: "tb-test",
        name: "TB skin test (for work/school)",
        cost: "$45",
        description: "Placement and reading of a tuberculin skin test for employment or school."
      },
      {
        id: "ear-syringe",
        name: "Ear syringing / wax removal",
        cost: "$40",
        description: "In-clinic ear irrigation when not covered as an insured service."
      }
    ]
  }
];

export const CLINIC_FEE_DISCLAIMER =
  "Fees are estimates for uninsured services and may change. Insured medically necessary visits are typically covered by your provincial health plan. Always confirm the final amount with reception before requesting a note, form, or procedure.";
