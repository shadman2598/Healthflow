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
| Patient | Own profile, appointments, messages, reminders, fee schedule read |
| Receptionist | Clinic patients, scheduling CRUD, messages, reminder rules |
| Clinician (`DOCTOR`) | Assigned patients + shared appointments; own schedule; assigned inbox |
| Nurse | Clinic directory read, messages, vitals update; no schedule CRUD / admin |
| Billing | Fee/invoice perms + read-only patients/appointments; no messaging / HCN reveal |
| Admin / Super Admin | Staff, audit logs, clinic settings, org switch (super/admin) |

Product aliases: `CLINICIAN` → `DOCTOR`, `ADMINISTRATOR` → `ADMIN`, `STAFF` → `NURSE`.

Permission catalog lives in `@technovate/shared` (`rbac.ts`): granular permissions mapped per role. API authorization is enforced on the server (`requireAuth`, `requirePermissions`, `assertCanViewPatientProfile`, appointment ownership, org-scope checks). Frontend role/permission pages and `PermissionGate` are UX only — never the security boundary.

`requireAuth` reloads the user on each request: inactive (`isActive=false`) accounts are rejected even with a valid JWT; live DB role is preferred over stale JWT claims (revoked privileges take effect immediately); non-admins cannot forge another clinic via the active-org cookie.

## Data minimization

- Store only fields needed for clinic workflow (contact info, height/weight, healthcare number, notes).
- Internal staff notes are never returned to patient API responses.
- Healthcare numbers are **masked** in UI by default; reveal requires confirmation and is **audit-logged**.

## Input validation & sanitization

- All request bodies validated with **Zod** schemas in `packages/shared`.
- Free-text fields passed through a sanitize helper before persistence.
- Healthcare numbers and emails validated for format; duplicate HCN prevented at create time.

## Audit logging

`AuditLog` is an **append-only** trail (Prompt 43). Application APIs expose **GET only**; POST/PUT/PATCH/DELETE on `/audit-logs` return **405**. Writers go through `writeAuditLog` (create-only).

Events cover authentication, record access/modification/deletion, permission/role changes, data export/sharing, AI generate/review/block, appointment and schedule changes, admin actions, and blocked prescription/order attempts (HealthFlow is not an Rx SoR).

Each event includes actor, role, organization, resource (`targetType`/`targetId`), action, timestamp (`createdAt`), source, and metadata (plus `auditTrailVersion` / category). **Admin-only** full audit log UI (`audit:read`).

Fields: actor user id, actor role, action, target type/id, source, timestamp, IP placeholder, metadata JSON.

## Encryption & sensitive fields

- Healthcare numbers stored in database; production should enable **database-level encryption** (e.g. Postgres TDE or cloud KMS).
- Application-level field encryption can be added for `healthcareNumber` using AES-GCM with a KMS-managed key (roadmap).
- JWT secret and provider API keys must live in environment variables only — never committed.

## Interoperability (FHIR)

- Vendor-neutral adapters live in `@technovate/shared` (`fhir.ts`, `interop.ts`). Domain models are **not** coupled to Epic/Cerner SDKs.
- Local connector maps HealthFlow SoR → FHIR R4 (`Patient`, `Practitioner`, `Organization`, `Appointment`, `Encounter`). Clinical chart resources return `OperationOutcome` until an EHR connector is registered.
- `/interop/fhir/*` requires auth + RBAC, rate limits (60/min), privacy consent for patient-identifiable exports, audit `DATA_EXPORTED`, retries on transient connector failures, and idempotent `/interop/sync/probe` via `Idempotency-Key`.
- Stub EHR connectors (`ehr-stub-epic`, `ehr-stub-cerner`) demonstrate swap-in without rewriting core routes.

## Scheduling engine

- Bookings go through `bookAppointmentTransactional` (Serializable isolation + conflict re-check + optional `Idempotency-Key`) to prevent double-book races.
- Provider weekly availability, schedule blocks, buffers, waitlist, and `/scheduling/sync` envelopes support external calendar sync without owning HealthFlow IDs.
- Insurance/eligibility gates are policy checks (HCN / phone) — not a payer integration.

## AI clinical-safety architecture

AI must **not** silently make clinical decisions. Capabilities are explicitly tiered in `@technovate/shared` (`ai-safety.ts`):

| Tier | Examples | Policy |
|------|----------|--------|
| Low-risk administrative | summarization, routing, extraction, classification, scheduling hints, drafting | Allowed with human review; RBAC `ai:use_admin` |
| Clinical assistance | visit/history summaries, draft documentation, information retrieval | Allowed as **unverified drafts** only; RBAC `ai:use_clinical_assist` + `ai:review` |
| High-risk clinical | diagnosis, treatment recommendations, medication decisions, triage | **Blocked** before generation |

Safety controls on every AI artifact:

- Source attribution, confidence/uncertainty notes, human review workflow
- Audit actions `AI_GENERATED` / `AI_REVIEWED` / `AI_BLOCKED` / `AI_FAILED`
- Prompt version (`AI_PROMPT_VERSION`) and model id tracking
- PHI-minimizing redaction before stub/model input; outputs always carry an unverified-fact disclaimer
- Failure/block handling persists status without presenting content as charted fact

API surface: `/ai/capabilities`, `/ai/artifacts`, `/ai/artifacts/:id/review` (rate-limited). No live clinical model is required for the safety contract — stubs still go through the same gates.

## NEXT_ACTION workflow intelligence

`NEXT_ACTION` (`packages/shared/src/next-action.ts`) recommends **workflow** next steps for patient, receptionist, clinician, nurse, and admin — never diagnosis or prescribing.

Every recommendation includes reason, structured source data, responsible role, urgency, status, and timestamp. Decisions are auditable (`NEXT_ACTION_DISMISSED` / `RESTORED` / `COMPLETED`) and reversible via `NextActionOverride` (dismiss does not delete history; restore clears the override).

API: `GET /next-actions`, `POST /next-actions/dismiss|complete|restore`.

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
