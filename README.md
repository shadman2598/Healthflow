# HealthFlow

> **Healthcare workflow platform** for clinics — appointments, messaging, reminders, and patient records.  
> **Official site:** https://shadman2598.github.io/Healthflow/  
> See **[HEALTHFLOW.md](./HEALTHFLOW.md)** for setup, demo accounts, and role routes.  
> See **[SECURITY.md](./SECURITY.md)** for privacy and security decisions.

---

# Technovate Reminders (legacy)

Automated appointment reminder system for clinics. Staff log in, manage patients and appointments, and the system sends email/SMS reminders automatically.

**Stack:** Express + TypeScript + Prisma (API) | Next.js + Tailwind (Web) | BullMQ + Redis (Jobs) | Postgres (Data)

```
technovate-reminders/
├── apps/api        Express REST API + reminder scheduler + worker
├── apps/web        Next.js 15 staff-facing UI
├── packages/shared Zod validation schemas shared by both apps
└── docker-compose  Postgres · Redis · MailHog
```

## Prerequisites

- Node.js 20+ (22+ recommended)
- Docker + Docker Compose

---

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts three containers:

| Service  | Port  | Purpose                        |
|----------|-------|--------------------------------|
| Postgres | 5432  | Application database           |
| Redis    | 6379  | BullMQ job queue               |
| MailHog  | 8025  | Local SMTP trap (web UI)       |

### 2. Install dependencies and configure

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Generate Prisma client, migrate, and seed

```bash
npm run prisma:generate -w @technovate/api
npm run prisma:migrate  -w @technovate/api -- --name init
npm run seed            -w @technovate/api
```

The seed creates:

| What             | Details                                                              |
|------------------|----------------------------------------------------------------------|
| Admin user       | `admin@clinic.test` / `Admin123!`                                    |
| 2 patients       | Jane Doe, John Smith                                                 |
| 3 appointments   | Tomorrow 10 AM, day-after 2:30 PM, **5 min from now** (demo)        |
| 4 reminder rules | `24h email`, `2h email`, `2h sms` (disabled), **`quick demo 2m email`** (enabled) |

### 4. Start everything

One command runs the API server, reminder scheduler, reminder worker, and Next.js dev server:

```bash
npm run dev:with-reminders
```

Or run each process in separate terminals:

```bash
npm run dev           -w @technovate/api   # API on :4000
npm run dev:scheduler -w @technovate/api   # Scans every 60s
npm run dev:worker    -w @technovate/api   # Processes queued jobs
npm run dev           -w @technovate/web   # Web on :3000
```

Verify:

```bash
curl http://localhost:4000/health   # {"ok":true,"service":"api"}
curl http://localhost:3000/api/health  # {"ok":true,"service":"web"}
```

### 5. Log in

1. Open **http://localhost:3000/login**
2. Sign in with the seeded admin account:
   - Email: **`admin@clinic.test`**
   - Password: **`Admin123!`**
3. You land on the **Dashboard** showing upcoming appointments, reminders sent today, and failed reminders.

---

## Demo Walkthrough

This walkthrough shows a reminder firing end-to-end in under 5 minutes.

### Step 1 — Create a patient

1. Click **Patients** in the sidebar.
2. Click **Add Patient**.
3. Fill in the form:
   - First name: `Alice`
   - Last name: `Demo`
   - Email: `alice@example.com`
   - Phone: `+15550001234`
4. Click **Create**.

### Step 2 — Create an appointment 5 minutes from now

1. Click **Appointments** in the sidebar.
2. Click **Add Appointment**.
3. Select the patient you just created (`Alice Demo`).
4. Set **Scheduled At** to the current time + 5 minutes.
5. Leave Status as **SCHEDULED**.
6. Optionally add a reason (e.g. `Demo checkup`).
7. Click **Create**.

### Step 3 — Verify the quick demo rule is enabled

1. Click **Reminder Rules** in the sidebar.
2. Find the row **`quick demo 2m email`** (offset: 2 minutes, channel: EMAIL).
3. Ensure the toggle shows **ON** (green). If it shows OFF, click it to enable.

### Step 4 — Wait and watch

Here is the timeline of what happens:

```
T+0:00  You create the appointment (scheduled at T+5:00)
T+1:00  Scheduler tick runs — sees appointment at T+5:00 with 2m rule
         → reminder is due at T+3:00 — not yet due, skipped
T+2:00  Scheduler tick — still not due (T+3:00 > T+2:00)
T+3:00  Scheduler tick — reminder IS due (now >= T+5:00 - 2m)
         → creates ReminderLog (PENDING)
         → enqueues BullMQ job
         → Worker picks up job immediately
         → Sends via dev fallback (no SendGrid configured)
         → Updates ReminderLog → SENT
```

The scheduler ticks every 60 seconds by default (`REMINDER_SCAN_INTERVAL_MS=60000`).

### Step 5 — Check the results

**In the web UI:**

1. Go to **Appointments**.
2. Click **View** on the appointment you created.
3. Scroll to the **Reminder Logs** table — you should see a row with:
   - Rule: `quick demo 2m email`
   - Channel: `EMAIL`
   - Status: **`SENT`**
   - Sent At: a timestamp

**In the server console** (the terminal running `dev:with-reminders`):

Look for these log lines:

```
[reminder-scheduler] tick complete, enqueued=1
[DEV EMAIL] { to: 'alice@example.com', subject: 'Appointment reminder', ... }
[reminder-worker] completed job <id>
```

**Via the API directly:**

```bash
curl -b cookies.txt "http://localhost:4000/reminder-logs?appointmentId=<APPOINTMENT_ID>"
```

---

## Provider Behavior

| Env vars set?                        | What happens                                  |
|--------------------------------------|-----------------------------------------------|
| `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` | Real emails sent via SendGrid            |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_PHONE` | Real SMS sent via Twilio |
| Neither (default)                    | Dev fallback: prints to console, marks as SENT |

In dev mode with no provider keys, you see `[DEV EMAIL]` and `[DEV SMS]` in the server console. The reminder is still marked as `SENT` so you can test the full flow without external accounts.

---

## Troubleshooting

### Ports already in use

Default ports: Postgres `5432`, Redis `6379`, API `4000`, Web `3000`, MailHog SMTP `1025` / UI `8025`.

```bash
# Find what's using a port
lsof -i :5432

# Option 1: Stop the conflicting service
# Option 2: Change the host port in docker-compose.yml
#   e.g. "5433:5432" maps host 5433 → container 5432
#   Then update DATABASE_URL in apps/api/.env accordingly
```

### Invalid or missing env vars

The API validates all env vars at startup using Zod. If a required var is missing, you get a clear error:

```
ZodError: [
  { code: 'too_small', minimum: 1, path: ['DATABASE_URL'], message: 'String must contain at least 1 character(s)' }
]
```

Ensure both `.env` files exist:
- `apps/api/.env` — required: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (min 12 chars), `WEB_ORIGIN`
- `apps/web/.env` — required: `NEXT_PUBLIC_API_URL`

If you see `JWT_SECRET` errors, make sure it is at least 12 characters. The default `super-secret-change-me` works.

### Cookies / auth not persisting

Symptoms: login succeeds but immediately redirects back to `/login`, or `GET /auth/me` returns 401.

Checklist:
1. `WEB_ORIGIN` in `apps/api/.env` must **exactly** match the browser URL (e.g. `http://localhost:3000`, not `http://127.0.0.1:3000`).
2. `COOKIE_SECURE=false` must be set for local HTTP (not HTTPS).
3. Browser must allow third-party cookies for localhost. Try an incognito window if unsure.
4. Both API and web must be accessed via the same hostname (`localhost`, not mixed with `127.0.0.1`).

### CORS errors

Symptoms: browser console shows `Access-Control-Allow-Origin` errors, or requests fail silently.

The API sets `cors({ origin: WEB_ORIGIN, credentials: true })`. The `WEB_ORIGIN` env var must match the exact URL in the browser's address bar:

```bash
# If web runs on port 3000:
WEB_ORIGIN=http://localhost:3000

# If you changed the web port to 3001:
WEB_ORIGIN=http://localhost:3001
```

### Reminders not sending

Symptom: appointment exists, rule is enabled, but no `ReminderLog` rows appear.

Checklist:
1. **Scheduler is running** — look for `[reminder-scheduler] tick complete` in the console. If missing, start it: `npm run dev:scheduler -w @technovate/api`
2. **Worker is running** — look for `[reminder-worker] started`. If missing: `npm run dev:worker -w @technovate/api`
3. **Appointment status is SCHEDULED** — cancelled/completed appointments are skipped.
4. **Appointment is within the 48-hour scan horizon** — the scheduler only looks at appointments between now and now + 48 hours.
5. **Rule is enabled** — check `/settings/reminders` in the web UI.
6. **Reminder is actually due** — for a 2-minute rule, `now >= scheduledAt - 2 minutes` must be true.
7. **Redis is running** — `docker compose ps` should show redis as healthy.

### Database connection refused

```bash
# Verify Postgres is running
docker compose ps postgres

# Test the connection
docker compose exec postgres psql -U postgres -d technovate_reminders -c "SELECT 1"

# If you changed the port, update DATABASE_URL in apps/api/.env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/technovate_reminders?schema=public
```

---

## Useful Scripts

```bash
# Development
npm run dev                              # API + Web (no reminders)
npm run dev:with-reminders               # API + Scheduler + Worker + Web
npm run dev -w @technovate/api           # API only
npm run dev -w @technovate/web           # Web only

# Build & lint
npm run build                            # Build all (shared → api → web)
npm run lint                             # TypeScript check all workspaces

# Database
npm run prisma:generate -w @technovate/api   # Regenerate Prisma client
npm run prisma:migrate  -w @technovate/api   # Create + apply migration
npm run prisma:deploy   -w @technovate/api   # Apply pending migrations (production)
npm run seed            -w @technovate/api   # Seed admin, rules, patients, appointments
npm run demo:reminder   -w @technovate/api   # One-shot: create patient + appointment for quick test

# Testing
npm run test       -w @technovate/api    # Run vitest (unit + integration)
npm run test:watch -w @technovate/api    # Watch mode
```

---

## API Endpoints Reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | — | Health check |
| POST | `/auth/login` | — | Email/password login, sets JWT cookie |
| POST | `/auth/logout` | — | Clears cookies |
| GET | `/auth/me` | Yes | Current user |
| POST | `/auth/staff` | Admin | Create staff user |
| GET | `/auth/clinics` | Yes | List organizations |
| POST | `/auth/select-clinic` | Admin | Switch active organization |
| GET | `/patients` | Yes | List patients |
| POST | `/patients` | Yes | Create patient |
| GET | `/patients/:id` | Yes | Get patient |
| PUT | `/patients/:id` | Yes | Update patient |
| DELETE | `/patients/:id` | Yes | Delete patient |
| GET | `/appointments?from=&to=` | Yes | List appointments (date filter) |
| POST | `/appointments` | Yes | Create appointment |
| GET | `/appointments/:id` | Yes | Get appointment |
| PUT | `/appointments/:id` | Yes | Update appointment |
| DELETE | `/appointments/:id` | Yes | Delete appointment |
| GET | `/reminder-rules` | Yes | List reminder rules |
| PUT | `/reminder-rules/:id` | Yes | Toggle rule enabled/disabled |
| GET | `/reminder-logs?appointmentId=&patientId=` | Yes | Query reminder logs |
