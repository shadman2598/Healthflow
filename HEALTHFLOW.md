# HealthFlow

Secure healthcare **workflow** platform for small clinics — appointments, messaging, reminders, patient records, and staff dashboards. **Not** for diagnosis or medical advice.

## Stack

| Layer | Technology |
|-------|------------|
| Web | Next.js 15, TypeScript, Tailwind CSS, React Hook Form, Zod |
| API | Express, TypeScript, Prisma, PostgreSQL |
| Jobs | BullMQ + Redis (appointment reminders) |
| Shared | Zod schemas in `packages/shared` |

## Quick start (local, no Docker)

### 1. Prerequisites

- Node.js 20+
- PostgreSQL running locally
- Redis (optional, for reminder worker)

### 2. Install & configure

```bash
cd /path/to/Playground
npm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` — set `DATABASE_URL` to your local Postgres.

### 3. Database

Your local DB may still have the old Technovate schema. **This destroys existing data** in `technovate_reminders` and recreates HealthFlow tables.

Reply **yes, reset my dev database** in chat, then run:

```bash
cd apps/api
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes, reset my dev database" npx prisma db push --force-reset
npx tsx prisma/seed.ts
```

Or manually:

```bash
cd apps/api
npx prisma db push --force-reset
npx tsx prisma/seed.ts
```

### 4. Run servers

**Terminal 1 — API**

```bash
cd apps/api
npx tsx src/index.ts
```

**Terminal 2 — Web**

```bash
npm run dev -w @technovate/web
```

Open **http://localhost:3000/login**

> If port 3000 is busy, Next.js may use 3001 — update `WEB_ORIGIN` in `apps/api/.env` to match.

### 5. Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@healthflow.demo` | `Admin123!` |
| Doctor | `doctor1@healthflow.demo` | `Staff123!` |
| Receptionist | `receptionist1@healthflow.demo` | `Staff123!` |
| Patient | `patient1@healthflow.demo` | `Patient123!` |

**Staff invite codes (signup):** `HF-RECEPT-2026`, `HF-DOCTOR-2026`

## Role entry points

| Role | Login | Dashboard |
|------|-------|-----------|
| Patient | `/login/patient` | `/patient/dashboard` |
| Receptionist | `/login/receptionist` | `/receptionist/dashboard` |
| Doctor | `/login/doctor` | `/doctor/dashboard` |
| Admin | `/login/admin` | `/admin/dashboard` |

Signup: `/signup/patient`, `/signup/staff`

## Seed data

- 1 clinic, 1 admin
- 3 doctors, 3 receptionists
- 25 patients, 50 appointments
- 20 message threads, 30 reminders, 50 audit logs

## Project structure

```
apps/
  api/          Express API, Prisma, RBAC, audit, reminders
  web/          Next.js HealthFlow UI
packages/
  shared/       Zod validation schemas
SECURITY.md     Privacy & security decisions
```

## Key API routes

| Area | Prefix |
|------|--------|
| Auth | `/auth/login`, `/auth/signup/patient`, `/auth/signup/staff`, `/auth/me` |
| Patients | `/patient-profiles` |
| Appointments | `/appointments` |
| Messages | `/messages` |
| Audit | `/audit` (admin) |
| Resources | `/resources/search` |

## Security

See [SECURITY.md](./SECURITY.md) for RBAC rules, audit logging, consent, rate limiting, and data handling.

## Future roadmap

- Real SMS via Twilio
- Google Maps API for resource finder
- EHR/EMR integrations
- Digital intake forms
- AI message summarization & triage suggestions (non-diagnostic)
- Patient check-in kiosk
- Doctor note assistance
- Secure file uploads
- Production MFA (TOTP/WebAuthn)
- Field-level encryption for healthcare numbers

## Legacy Technovate routes

Older staff UI pages (`/dashboard`, `/patients`, `/appointments`, `/tour`) remain for reference. New work uses HealthFlow role-based routes above.
