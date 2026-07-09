# HealthFlow Security & Privacy Notes

HealthFlow is a **clinic workflow platform** — not a diagnostic or treatment tool. This document summarizes security decisions for the MVP.

## Scope & disclaimers

- The app supports appointments, messaging, reminders, patient records, and staff workflows only.
- It does **not** provide diagnosis, treatment decisions, or medical advice.
- Emergency disclaimer is shown on patient FAQ and signup consent flows.
- Resource finder returns nearby listings for convenience only — **no provider endorsement**.

## Authentication

- Passwords are hashed with **bcrypt** (credentials provider).
- Sessions use **HTTP-only cookies** with `Secure` flag configurable via `COOKIE_SECURE` (set `true` in production behind HTTPS).
- Separate login/signup entry points per role reduce accidental privilege escalation.
- Staff signup (receptionist, doctor) requires a valid **invite code** (`RoleInvite` table) before activation.
- MFA-ready structure: `User.mfaEnabled` and `User.mfaSecret` fields reserved for future TOTP/WebAuthn.

## Role-based access control (RBAC)

| Role | Access summary |
|------|----------------|
| Patient | Own profile, appointments, messages, reminders, resources |
| Receptionist | Clinic patients, scheduling, messages, reminders (no admin settings) |
| Doctor | Assigned patients, appointments, messages |
| Admin / Super Admin | Staff, patients, audit logs, system settings |

Every API route and server action calls authorization helpers (`requireAuth`, `requireRole`, `canViewPatient`, etc.) before data access.

## Data minimization

- Store only fields needed for clinic workflow (contact info, height/weight, healthcare number, notes).
- Internal staff notes are never returned to patient API responses.
- Healthcare numbers are **masked** in UI by default; reveal requires confirmation and is **audit-logged**.

## Input validation & sanitization

- All request bodies validated with **Zod** schemas in `packages/shared`.
- Free-text fields passed through a sanitize helper before persistence.
- Healthcare numbers and emails validated for format; duplicate HCN prevented at create time.

## Audit logging

`AuditLog` records include:

- Login / logout
- Patient viewed / created / updated
- Appointment created / updated
- Message sent / read
- Reminder created / sent
- Role changed
- Healthcare number revealed

Fields: actor user id, actor role, action, target type/id, timestamp, IP placeholder, metadata JSON. **Admin-only** full audit log UI.

## Encryption & sensitive fields

- Healthcare numbers stored in database; production should enable **database-level encryption** (e.g. Postgres TDE or cloud KMS).
- Application-level field encryption can be added for `healthcareNumber` using AES-GCM with a KMS-managed key (roadmap).
- JWT secret and provider API keys must live in environment variables only — never committed.

## Rate limiting

Applied to:

- Login attempts
- Messaging endpoints
- Patient search

Uses in-memory sliding window in development; replace with Redis-backed limiter in production.

## Session management

- Configurable JWT expiry (`JWT_EXPIRES_IN`, default 7d — shorten for production).
- Logout clears auth cookie and writes audit event.
- Last login timestamp updated on successful authentication.
- Suspicious login logging placeholder via audit metadata (IP, user-agent).

## Reminders & messaging

- Reminder providers abstracted: `EmailProvider`, `SmsProvider`, `NotificationProvider`.
- SMS and push use **mock send** unless Twilio / notification keys are configured.
- Messages cannot be deleted — only **archived** to preserve record history.

## HTTPS & headers

- Deploy behind HTTPS (reverse proxy / platform TLS).
- Set `COOKIE_SECURE=true` and `WEB_ORIGIN` to production origin.
- Add HSTS, `X-Content-Type-Options`, and CSP headers at the edge (roadmap).

## Patient consent

- Patient self-signup requires privacy notice acknowledgment checkbox.
- Consent timestamp stored on `PatientProfile.privacyConsentAt`.

## Least privilege

- Patients scoped to `patientProfileId` on every query.
- Doctors limited to assigned patients where applicable.
- Receptionists scoped to organization; no cross-clinic access.
- Admin actions on staff roles are logged.

## What this MVP does not include (yet)

See README **Future roadmap**: real SMS, Google Maps, EHR integration, digital intake forms, secure file uploads, production-grade WAF, and formal penetration testing.

## Reporting

For security concerns in a production deployment, define a contact address in your clinic's privacy policy and incident response runbook.
