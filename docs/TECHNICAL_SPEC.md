# Ezly — Technical Software Specification

Version 1.0 · 2026-10-21

Ezly is a web-based insurance agency platform: an agency management system (AMS)
with a built-in personal-lines comparative rater. This spec is derived from a
walkthrough of 30 EZLynx screens (dashboard, accounts, rating, documents,
requests, reports, marketplace) plus public product information. Ezly is an
independent product; it must not copy EZLynx branding, logos, text or assets.

---

## 1. Goals and scope

**Primary users**

| Role | What they do |
|---|---|
| Agency owner / admin | Manages users, carriers, agency settings, billing, reports |
| Producer (agent) | Owns leads, runs quotes, sells policies |
| CSR (customer service rep) | Services accounts, documents, tasks, requests |
| Insured (later phase) | Self-service portal: ID cards, documents, change requests |

**In scope (v1):** personal lines — Auto, Home (HO3/HO4/HO6), Dwelling Fire.
**Later:** commercial lines, accounting/commissions, client portal, e-signature,
AI assistant, integrations marketplace.

**Non-goals for v1:** acting as a carrier; real-time carrier rating before
carrier/aggregator agreements exist (a pluggable rating adapter with a
simulated carrier ships first).

---

## 2. Screen inventory (observed → Ezly module)

| Observed screen | Purpose | Ezly module |
|---|---|---|
| Dashboard | Widgets: eSignature status counts, underwriting request counts (30d/7d/today), alerts, help links, promo carousel, tasks side panel | `dashboard` |
| Global top bar | Search, AI button, quick-create, task list, notifications bell, org switcher, help | `shell` |
| Left icon rail | Dashboard, Accounts, Policy Mgmt, Reports, Settings, Directory, Integrations, Marketplace | `shell` |
| Applicant Search | Free-text search with "search on" field checkboxes (name, co-applicant, business name, email, policy #, applicant id, city, zip, phone); filters: personal/commercial, lead status, applicant type, lead source; mine vs all | `accounts.search` |
| Search Results | Paginated table: last/first name, producer, CSR, city, state, zip; export | `accounts.search` |
| Create Personal Applicant | Large form with required-for-save vs required-for-rating validation, prefill, VIP flag, labels, multiple addresses/phones/emails, map preview | `accounts.create` |
| Import Applicant | Import from another management system (40+ AMS options) or file | `accounts.import` |
| Account → Overview | Policies / Applications tabs (each application has LOB, description, last-modified, valid/invalid badge), Tasks card, Actions menu, "Catch me up" AI summary | `accounts.overview` |
| Account → Policies | Totals (written premium, annualized premium, time with agency), sort, card/table view, add policy | `policies` |
| Account → Details | Full applicant record + contacts + co-applicant | `accounts.details` |
| Account → Quotes | Quote history (last rated, LOB, description), add quote | `rating` |
| Quote Results | Per-carrier premium bars (graph view), pay plan toggle (full pay/monthly/EFT), sort, carrier badges, error count with "view errors", cross-sell cards, resubmit/email/download/print/delete | `rating.results` |
| Account → Lead Info | Lead source, priority, status, probability of sale, assigned producer, sold-policy info per LOB (carrier, sold date, policy #, premium, term, renewal date) | `leads` |
| Account → Documents | Document library: type, name, labels, policy #, created by, dates, actions, filters; e-signature envelopes section | `documents` |
| Account → Requests | Underwriting requests: date, type (e.g. finalize premium), status, requested by, carrier, LOB, owner | `uw_requests` |
| Account → Activity | Activities (notes/emails/texts) and system log; search, filters, discussion view, move activities | `activity` |
| Account sidebar | Name, type, since, producer, CSR, agency, address with Map/Zillow/Google Earth/County Assessor links, contact info, integrations | `accounts.sidebar` |
| Underwriting Requests (global) | All / waiting on me / bind requests, date filters, group duplicates | `uw_requests` |
| Tasks (global) | Groups: overdue, today, upcoming, no due date; search, filters | `tasks` |
| Directory | Agency contacts directory (empty state + add entry) | `directory` |
| Reports | Categories: accounting, activity, applicant, book of business, claim, commission, policy transaction, quote, retention, sales | `reports` |
| Marketplace | Integration catalog grouped by category with search/tags | `integrations` |
| Policy Management | Upsell landing for full AMS tier | feature flag / plan gating |
| Support / training portals | External helpdesk & LMS | external links |

---

## 3. Architecture

```
 Browser (Next.js React app)
        │  HTTPS (JSON / tRPC-style typed API)
        ▼
 Next.js server (API routes, server actions, auth)
        │                        │
        ▼                        ▼
 PostgreSQL (Prisma ORM)    Redis + BullMQ workers
  - row-level tenant          - rating jobs (fan-out per carrier)
    isolation                 - imports, emails, reminders, reports
        │                        │
        ▼                        ▼
 S3-compatible storage      Carrier rating adapters
  (documents, exports)        (simulated → real APIs / aggregator)
```

### 3.1 Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript | One codebase for UI + API, SSR for fast list pages |
| UI | Tailwind CSS + shadcn/ui, TanStack Table, React Hook Form + Zod | Dense data tables and very large forms are the core UI |
| API | Next.js route handlers / server actions, Zod-validated | Shared types front-to-back |
| DB | PostgreSQL 16 + Prisma | Relational data, strong constraints, JSONB for LOB-specific risk data |
| Search | Postgres `pg_trgm` + full-text (v1); OpenSearch if needed later | Fuzzy name/phone/policy # search |
| Jobs | Redis + BullMQ | Parallel carrier rating, imports, scheduled renewals |
| Files | S3 / Cloudflare R2, presigned uploads | Document library |
| Auth | Auth.js (email + password, Google/Microsoft SSO), TOTP MFA | Agency staff accounts |
| Email/SMS | Postmark / Twilio | Quote emails, reminders |
| Maps | Google Maps / Mapbox geocoding | Address validation, county lookup, map preview |
| Hosting | Vercel (web) + managed Postgres (Neon/RDS) + Upstash Redis; or Docker on AWS | Simple start, scalable later |
| Observability | Sentry, OpenTelemetry, structured logs | |
| Testing | Vitest (unit), Playwright (e2e) | |

### 3.2 Multi-tenancy

Every business table carries `agency_id`. All queries go through a repository
layer that injects the tenant from the session, backed by PostgreSQL Row-Level
Security policies (`agency_id = current_setting('app.agency_id')`) as a second
line of defense.

---

## 4. Data model

Core entities (simplified; all have `id uuid`, `agency_id`, `created_at`,
`updated_at`, `created_by`).

```
Agency ─┬─ User (role: admin|producer|csr, status)
        ├─ Carrier (name, naic, appointed_states[], adapter_key, enabled)
        ├─ Label, LeadSource, DirectoryEntry
        └─ Account (applicant)
              ├─ Person (primary applicant, co-applicant; relationship)
              ├─ Address (type, line1/2, unit, city, county, state, zip, zip4,
              │           years_at, months_at, is_primary, previous)
              ├─ Phone (type, number) · Email (type, address)
              ├─ LeadInfo (source, priority, status, probability, ...)
              ├─ Application (lob, status: draft|valid|invalid, risk JSONB)
              │     ├─ Driver · Vehicle            (Auto)
              │     └─ Dwelling                     (Home / Dwelling Fire)
              ├─ QuoteRun (application_id, pay_plan, submitted_at, status)
              │     └─ CarrierQuote (carrier_id, status: ok|error|declined,
              │                       premium, term_months, coverages JSONB,
              │                       errors[], bridge_url)
              ├─ Policy (lob, carrier_id, number, status, effective, expiration,
              │          term, written_premium, annualized_premium, source_quote_id)
              ├─ Document (s3_key, name, type, labels[], policy_id, size, mime)
              ├─ UnderwritingRequest (type, status, carrier_id, lob, owner_id,
              │                       requested_by, messages[])
              ├─ Task (title, due_at, assignee_id, status, priority)
              └─ Activity (kind: note|email|sms|call|system, body, at)
AuditLog (actor, entity, entity_id, action, diff JSONB)  -- feeds "System Log"
```

**Person fields** (from the applicant form): prefix, first*, middle initial,
last*, suffix, maiden name, nickname, gender†, DOB†, marital status†, SSN
(encrypted), DL #, DL status, DL state, education, industry†, occupation†,
years in occupation, prior employer years, applicant type, customer since,
account name, assigned producer, CSR, lead source, preferred language,
deceased, VIP, labels. (`*` required to save, `†` required to rate.)

**Validation tiers:** each field declares `requiredFor: "save" | "rate"`.
The UI shows red (blocks save) vs orange (blocks rating) hints; an
Application is `valid` only when all rate-required fields for its LOB pass.
This drives the OK/Invalid badges on the Overview.

---

## 5. Module specifications

### 5.1 App shell
- Top bar: global search (accounts, policy #, phone), quick-create (new
  applicant), task drawer, notifications, user menu, help.
- Left rail navigation; collapsible account sidebar on account pages.
- Responsive down to tablet; key read-only views usable on phone.

### 5.2 Dashboard
Configurable widget grid. v1 widgets: Tasks (mine), Underwriting requests
(counts by window), Alerts, Renewals due (30/60/90 days), Quotes this week,
Recent accounts. Each count links to a pre-filtered list.

### 5.3 Accounts
- **Search**: single box + "search on" field toggles + filters (personal/
  commercial, lead status, applicant type, lead source, mine/all). Paginated,
  sortable, CSV export (permission-gated).
- **Create/Edit**: sectioned form (Applicant info, Contact info with
  repeatable addresses/phones/emails, co-applicants). Address autocomplete
  fills city/county/zip4. "Previous address" section appears when years at
  address < 3. Buttons: Save, Go to Auto, Go to Home.
- **Prefill** (later): lookup of vehicles/drivers/property data by name and
  address through a data vendor.
- **Import**: CSV/XLSX mapping wizard (v1); ACORD AL3/XML import (later).
  Dedupe on name + DOB + address.
- **Sidebar**: summary + external links (map, property sites, county
  assessor search URL built from county/state).
- **Tabs**: Overview, Policies, Details, Quotes, Lead Info, Documents,
  Requests, Activity (routes: `/accounts/[id]/<tab>`).

### 5.4 Applications & rating (comparative rater)
1. Producer opens Auto or Home application; LOB-specific forms:
   - Auto: drivers (license, violations, accidents), vehicles (VIN decode,
     use, mileage), coverages (BI/PD/UM/comp/collision deductibles), prior
     insurance.
   - Home: dwelling (year built, sq ft, construction, roof, protection
     class), coverages (A–F, deductibles), claims history.
2. "Rate" validates, creates a `QuoteRun`, and enqueues one job per
   enabled carrier appointed in the risk state.
3. Each job calls a **RatingAdapter**:
   ```ts
   interface RatingAdapter {
     key: string;
     supports(lob: Lob, state: string): boolean;
     rate(input: NormalizedRisk): Promise<CarrierQuoteResult>; // premium | errors
   }
   ```
   v1 ships `SimulatedAdapter` (deterministic rating tables). Real adapters
   map `NormalizedRisk` to a carrier API or an aggregator, usually via ACORD
   XML.
4. Results stream to the UI (Server-Sent Events) as each carrier returns.
5. **Results page**: bar or table view; pay plan toggle (full pay/monthly/
   EFT); sort by premium; badges (preferred, local, national); error summary
   with per-carrier messages; actions: resubmit, email to client (PDF),
   download, print, delete; "bridge" to carrier site where supported.
6. Selecting a quote → "Bind request" creates an `UnderwritingRequest`
   or, if bound, a `Policy` with `source_quote_id`.

### 5.5 Policies
List per account and agency-wide; totals (written, annualized, time with
agency); card/table view; statuses: quoted, bound, active, renewing,
cancelled, expired, non-renewed. Renewal job runs nightly, creates renewal
tasks at 60/30 days and flags premium changes.

### 5.6 Lead management
Lead source, priority, status (new → contacted → quoted → sold/lost),
probability of sale, assigned producer, sold-policy info. Lead pipeline
board (kanban) and conversion reports.

### 5.7 Documents & e-signature
Upload (drag/drop, presigned S3), folders, labels, link to policy, preview
PDFs/images, filters, bulk actions. Virus scan on upload. Generated quote
proposals land here automatically. E-signature (later) via a provider API
(e.g. Dropbox Sign/DocuSign); envelope status feeds the dashboard widget.

### 5.8 Underwriting requests
Types: finalize premium, bind request, endorsement, question. Statuses:
initial request → in review → waiting on agent → completed/declined.
Threaded messages + attachments; "waiting on me" filter; group duplicates.

### 5.9 Tasks & activity
Tasks with due date, assignee, account link, recurrence; grouped overdue /
today / upcoming / no date. Activity timeline merges notes, emails, SMS,
calls and system log (from `AuditLog`).

### 5.10 Directory
Agency-wide contacts (carrier underwriters, vendors, lenders) with search.

### 5.11 Reports
Categories mirrored from the observed menu: Applicant, Book of Business,
Quote (quote-to-bind), Policy Transaction, Retention (renewals, premium
change), Sales, Activity, Commission, Claim, Accounting. v1: Applicant, Book
of Business, Quote, Retention, Activity built with SQL views + charts;
CSV export; scheduled email delivery later.

### 5.12 Settings & admin
Agency profile, users & roles, carriers & appointments, lead sources,
labels, document types, email templates, data retention, audit log viewer.

### 5.13 Integrations marketplace (later)
Catalog of add-ons (prefill, phone, email, reviews, cross-sell partners).
Internally: webhook events (`account.created`, `quote.completed`,
`policy.bound`) + OAuth app credentials per agency.

### 5.14 AI assistant (later)
"Catch me up" account summary from activity/docs; quote explanation;
draft client emails. Uses an LLM via server-side API with tenant-scoped
retrieval; never sends SSNs or DL numbers to the model.

---

## 6. API design

REST-style, JSON, versioned under `/api/v1`, Zod-validated, cursor
pagination.

```
GET    /api/v1/accounts?q=&fields=&leadStatus=&mine=&cursor=
POST   /api/v1/accounts
GET    /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id
POST   /api/v1/accounts/import            (multipart CSV)
GET    /api/v1/accounts/:id/applications
POST   /api/v1/applications               {accountId, lob}
PATCH  /api/v1/applications/:id
POST   /api/v1/applications/:id/validate
POST   /api/v1/applications/:id/quote-runs {payPlan}
GET    /api/v1/quote-runs/:id             (+ /stream for SSE)
POST   /api/v1/carrier-quotes/:id/bind
GET    /api/v1/policies?accountId=&status=&renewingWithinDays=
POST   /api/v1/documents/presign  ·  POST /api/v1/documents
GET|POST|PATCH /api/v1/uw-requests, /tasks, /activities, /directory
GET    /api/v1/reports/:key?from=&to=
```

---

## 7. Security & compliance

Ezly stores insurance PII (DOB, SSN, driver's license, addresses).

- TLS everywhere; HSTS. Encryption at rest (DB + S3).
- Field-level encryption (AES-256-GCM, KMS-managed keys) for SSN and DL #;
  masked in UI (`***-**-1234`), reveal is permission-gated and audited.
- RBAC: admin / producer / CSR / read-only; optional "only my accounts".
- MFA for all staff; session timeout; IP allowlist option.
- Full audit log of reads of sensitive fields and all writes.
- Tenant isolation via RLS; automated tests that cross-tenant access fails.
- OWASP ASVS L2 baseline: CSRF protection, output encoding, rate limiting,
  dependency scanning, secret scanning.
- Compliance targets: GLBA safeguards, state insurance data-security laws
  (NAIC model law), CCPA; SOC 2 Type I before selling to larger agencies.
- Backups: PITR on Postgres, daily snapshot, tested restores.
- Never use real customer data in development or tests — seed with faker.

---

## 8. Non-functional requirements

| Area | Target |
|---|---|
| Page load (list pages) | < 1.5 s p95 |
| Search | < 300 ms p95 for 100k accounts |
| Rating | First carrier result < 5 s; run complete < 30 s |
| Availability | 99.9% |
| Accessibility | WCAG 2.1 AA |
| Browsers | Last 2 versions of Chrome, Edge, Safari, Firefox |

---

## 9. Repository layout (target)

```
apps/web/                 Next.js app (UI + API)
  app/(shell)/dashboard
  app/(shell)/accounts/[id]/{overview,policies,details,quotes,lead,documents,requests,activity}
  app/api/v1/...
packages/db/              Prisma schema, migrations, seed
packages/rating/          RatingAdapter interface, simulated adapter, rating tables
packages/validation/      Zod schemas shared by forms + API (save vs rate rules)
packages/ui/              Shared components (DataTable, FormSection, AccountSidebar)
workers/                  BullMQ workers (rating, import, renewals, email)
docs/                     This spec, implementation plan, ADRs
```
