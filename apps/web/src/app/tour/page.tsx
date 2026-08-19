import Link from "next/link";

type TourLink = { href: string; title: string; description: string; badge?: string };

const entry: TourLink[] = [
  { href: "/", title: "Who are you?", description: "Role picker, guest browse, demo credentials.", badge: "Start" },
  { href: "/?guest=patient", title: "Guest: Patient", description: "Look around every patient page. No account." },
  { href: "/?guest=doctor", title: "Guest: Doctor", description: "Look around every doctor page. No account." },
  { href: "/?guest=receptionist", title: "Guest: Receptionist", description: "Look around every receptionist page. No account." },
  { href: "/login/patient", title: "Patient sign in", description: "Demo: patient1@healthflow.demo" },
  { href: "/login/doctor", title: "Doctor sign in", description: "Demo: doctor1@healthflow.demo" },
  { href: "/login/receptionist", title: "Receptionist sign in", description: "Demo: receptionist1@healthflow.demo" },
  { href: "/login/admin", title: "Admin sign in", description: "Demo: admin@healthflow.demo" }
];

const patient: TourLink[] = [
  { href: "/patient/dashboard", title: "Patient dashboard", description: "KPIs, upcoming visits, Care Guide shortcut." },
  { href: "/patient/care-guide", title: "Care Guide", description: "Next-step guide, visit prep, ask the clinic." },
  { href: "/calendar", title: "Calendar", description: "Shared calendar views." },
  { href: "/messages", title: "Messages", description: "Secure clinic messaging." },
  { href: "/patient/book", title: "Book a visit", description: "Checkup in a few taps. Other needs too." },
  { href: "/patient/visits", title: "My visits", description: "Coming soon, alerts, and old visits." },
  { href: "/patient/appointments", title: "Change a visit", description: "Confirm, reschedule, cancel." },
  { href: "/resources", title: "Fees & Resources", description: "Clinic fees + nearby map finder." },
  { href: "/resources?tab=finder", title: "Nearby finder", description: "Postal-code resource search." },
  { href: "/faq", title: "FAQ", description: "Common clinic questions." },
  { href: "/patient/profile", title: "Profile", description: "Contact info and reminder preferences." }
];

const staff: TourLink[] = [
  { href: "/receptionist/dashboard", title: "Receptionist dashboard", description: "Schedule and clinic ops overview." },
  { href: "/doctor/dashboard", title: "Doctor dashboard", description: "Schedule and patient messages." },
  { href: "/admin/dashboard", title: "Admin dashboard", description: "Clinic oversight." },
  { href: "/patients", title: "Patients", description: "Patient directory (staff)." },
  { href: "/reminders", title: "Reminders", description: "Appointment reminders (staff)." },
  { href: "/overdue-checkups", title: "Overdue checkups", description: "Patients past yearly checkup." },
  { href: "/admin/staff", title: "Staff", description: "Invite and manage staff." },
  { href: "/admin/audit-logs", title: "Audit logs", description: "Security and access history." },
  { href: "/admin/settings", title: "Admin settings", description: "Clinic configuration." }
];

export default function TourPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">HealthFlow</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">UI tour — all screens</h1>
          <p className="mt-2 text-sm text-slate-600">
            Open each surface from here. Patient routes work with guest or patient login. Staff routes need the matching
            staff account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Web: http://127.0.0.1:3000</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">API: http://127.0.0.1:4000</span>
          </div>
        </div>

        <TourSection title="1. Entry" items={entry} />
        <TourSection title="2. Patient portal" items={patient} />
        <TourSection title="3. Staff portals (after login)" items={staff} />

        <p className="text-center text-xs text-slate-400">
          Bookmark: <span className="font-mono text-slate-600">/tour</span>
        </p>
      </div>
    </div>
  );
}

function TourSection({ title, items }: { title: string; items: TourLink[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <TourCard key={item.href + item.title} {...item} />
        ))}
      </div>
    </section>
  );
}

function TourCard({ href, title, description, badge }: TourLink) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        <p className="mt-1 font-mono text-[11px] text-slate-400">{href}</p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
