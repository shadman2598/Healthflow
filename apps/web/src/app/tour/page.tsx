import Link from "next/link";

type TourLink = { href: string; title: string; description: string; badge?: string };

const staffAfterLogin: TourLink[] = [
  { href: "/dashboard", title: "Dashboard", description: "KPI cards, today’s appointments, timeline, alerts, activity feed." },
  { href: "/appointments", title: "Appointments", description: "Table, filters, create/edit modal, status badges." },
  { href: "/patients", title: "Patients", description: "Directory, search, add/edit modal, avatars." },
  { href: "/messages", title: "Messages", description: "Clinic messaging placeholder (coming soon)." },
  { href: "/settings/reminders", title: "Reminder rules", description: "Toggle rules, channel icons, offsets." }
];

const patient: TourLink[] = [
  { href: "/patient", title: "Patient home", description: "Upcoming card, quick actions, notifications (demo data)." },
  { href: "/patient/appointments", title: "Patient appointments", description: "Upcoming vs past, confirm / reschedule / cancel (UI demo)." },
  { href: "/patient/messages", title: "Patient messages", description: "Chat-style thread (demo data)." }
];

export default function TourPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Technovate Reminders</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">UI tour — all screens</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use this page to open every designed surface. Staff areas need a session: sign in first, then open the links below
            (they work in the same browser tab session).
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">Web: localhost:3000</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">API: localhost:4000</span>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">1. Staff sign-in</h2>
          <TourCard
            href="/login"
            title="Login"
            description="Split layout, branding panel, credentials form."
            badge="Start here"
          />
          <p className="mt-2 text-xs text-slate-500">
            Demo: <code className="rounded bg-slate-100 px-1">admin@clinic.test</code> /{" "}
            <code className="rounded bg-slate-100 px-1">Admin123!</code>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">2. Staff app (after login)</h2>
          <div className="space-y-2">
            {staffAfterLogin.map((item) => (
              <TourCard key={item.href} {...item} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            For appointment detail &amp; reminder logs, open any row from Appointments → View, or go to{" "}
            <code className="rounded bg-slate-100 px-1">/appointments/&lt;id&gt;</code>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">3. Patient portal (demo UI)</h2>
          <div className="space-y-2">
            {patient.map((item) => (
              <TourCard key={item.href} {...item} badge="No login" />
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-slate-400">
          You can bookmark this page: <span className="font-mono text-slate-600">/tour</span>
        </p>
      </div>
    </div>
  );
}

function TourCard({ href, title, description, badge }: TourLink) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{title}</span>
          {badge ? (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        <p className="mt-1 font-mono text-xs text-brand-600">{href}</p>
      </div>
      <span className="shrink-0 text-slate-300">→</span>
    </Link>
  );
}
