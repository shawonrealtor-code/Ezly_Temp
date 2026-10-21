# Ezly — Implementation Plan

Companion to [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md). Estimates assume one
full-stack developer working with Claude Code; parallel developers shorten
phases 3–6.

## Phase 0 — Foundation (week 1)
- Convert repo to a pnpm monorepo (`apps/web`, `packages/*`); keep the current
  static MVP in `prototype/` as a clickable reference.
- Next.js + TypeScript + Tailwind + shadcn/ui; ESLint, Prettier, Vitest,
  Playwright; GitHub Actions CI (lint, typecheck, test, build).
- Docker Compose for local Postgres + Redis; Prisma setup; faker seed script.
- **Done when:** CI is green and `pnpm dev` shows an empty shell.

## Phase 1 — Auth, tenancy, shell (week 2)
- Auth.js login, MFA, invite users, roles.
- `Agency`, `User` tables; tenant middleware + Postgres RLS + isolation tests.
- App shell: top bar, left rail, notifications stub, task drawer stub.
- **Done when:** two agencies can log in and never see each other's data.

## Phase 2 — Accounts (weeks 3–4)
- Account/Person/Address/Phone/Email schema and API.
- Create/edit applicant form with save vs rate validation tiers, repeatable
  contacts, co-applicant, previous address rule, address autocomplete.
- Account page with sidebar + tab routing; Details and Overview tabs.
- Search page with field toggles, filters, pagination, CSV export.
- CSV import wizard with column mapping and dedupe.
- **Done when:** a CSR can import 500 accounts, find one, and edit it.

## Phase 3 — Applications & comparative rater (weeks 5–7)
- Auto (drivers, vehicles, coverages) and Home/Dwelling Fire application forms;
  OK/Invalid status on Overview.
- `packages/rating`: `RatingAdapter` interface + `SimulatedAdapter` with
  state/LOB rating tables for 5–8 fictional carriers.
- BullMQ fan-out worker, `QuoteRun`/`CarrierQuote` persistence, SSE streaming.
- Results page: bar/table view, pay plans, sort, errors panel, resubmit,
  PDF proposal (saved to Documents), email to client.
- Quotes tab with history.
- **Done when:** a producer rates a home and an auto risk and sees results
  from all carriers in under 10 s.

## Phase 4 — Policies, leads, tasks, activity (weeks 8–9)
- Bind from quote → Policy; manual add policy; Policies tab with totals.
- Lead Info tab and lead pipeline board.
- Tasks (global + per account, grouped by due state), Activity timeline,
  AuditLog-backed System Log.
- Nightly renewal job: renewal tasks at 60/30 days; dashboard widgets.
- **Done when:** the full lead → quote → bind → renewal loop works end to end.

## Phase 5 — Documents & underwriting requests (week 10)
- S3 presigned uploads, document library with labels/filters/preview,
  virus scan.
- Underwriting requests with threaded messages, global list with
  "waiting on me" and bind-request filters.

## Phase 6 — Reports & settings (week 11)
- Report catalog; Applicant, Book of Business, Quote-to-bind, Retention,
  Activity reports with charts and CSV export.
- Settings: carriers & appointments, lead sources, labels, templates, users.
- Directory.

## Phase 7 — Hardening & launch (week 12)
- Field encryption for SSN/DL, masked reveal + audit, rate limiting,
  security review, pen-test checklist, backups/restore drill.
- Performance pass (search indexes, pagination), accessibility audit.
- Deploy staging + production, Sentry, uptime monitoring; pilot agency.

## Later phases
- Real carrier connectivity (carrier APIs or a rating aggregator — needs
  business agreements and appointments; start conversations in Phase 3).
- Data prefill (vehicles/drivers/property), VIN decode.
- E-signature, client self-service portal, SMS.
- Accounting & commissions, commercial lines.
- Integrations marketplace + webhooks; AI "catch me up" summaries.

## Key risks
| Risk | Mitigation |
|---|---|
| Carrier rating access | Adapter abstraction; simulated carrier first; pursue aggregator partnership early |
| PII breach | Encryption, RBAC, audit, no real data in dev, security review before pilot |
| Form complexity (hundreds of fields) | Schema-driven forms from shared Zod definitions |
| Scope creep | Ship phases 0–4 as the usable MVP before anything in "Later" |

## First tasks to start now
1. Set up monorepo + CI (Phase 0).
2. Write Prisma schema for Agency/User/Account/Person/Address/Phone/Email.
3. Build the applicant form with save vs rate validation.
