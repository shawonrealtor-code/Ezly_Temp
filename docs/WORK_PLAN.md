# Ezly — Work Plan (Segments)

Version 1.0 · 2026-10-26

## Decisions this plan follows

| Topic | Decision |
|---|---|
| Hosting | Saha Agency's existing **Hostinger** account. Ezly runs on that server; no other hosting. |
| Third-party services | None that cost money. Everything runs on the Hostinger server itself. |
| Domain | Hostinger's free temporary address while building; `app.` + the agency's own domain at go-live (Segment 8). |
| Database | **JSON files** on the server, behind a storage layer so it can be swapped for SQLite/PostgreSQL later without changing the app. |
| Spending | **$0 extra.** No paid plans, APIs, or services. Anything that would cost money is left out or replaced with a free built-in alternative. |
| Insurers | Simulated insurers until real access is arranged. |

### What changes from earlier documents

- Option A/B infrastructure (`docs/operations/`) is kept as the **future** path. The
  security rules in them (MFA, roles, encryption of SSN/DL, audit log, backups) still
  apply and are implemented on Hostinger with free tools.
- PostgreSQL, Redis and Prisma are replaced by the JSON storage layer and an in-process
  job runner. Their code stays only until Segment 1 replaces it.
- Email: sent through the agency's existing Hostinger mailbox (SMTP), so no email service
  fee. Google Maps autocomplete is left out (it requires a card); addresses are typed
  manually, with free US ZIP/county validation from a bundled data file.

### Rules for JSON storage

JSON files are fine for one agency of this size if these rules hold. They are part of
Segment 1's "done" checks.

1. **One writer at a time.** All writes go through one storage module that locks, writes
   to a temp file, then renames (no half-written files after a crash).
2. **Encrypted at rest.** Restricted fields (SSN, driver's license, bank details) are
   encrypted with AES-256-GCM before they reach the file. The key lives in an
   environment variable on the server, never in the files or in git.
3. **Outside the website folder.** Data files sit in a private directory that the web
   server never serves directly (e.g. `~/ezly-data/`, not `public_html/`).
4. **Backups.** Automatic daily compressed, encrypted copy, kept 14 days, plus a weekly
   download to an offline drive by the owner.
5. **Validated.** Every record is checked against a schema before it is saved.
6. **Size watch.** If data passes ~50,000 clients or writes slow down, move to SQLite (also
   free, also a single file) using the same storage layer.

---

## Segments

Each segment ends with something working that you can click through. Segments run in
order; each one lists what it needs from earlier ones.

### Segment 0 — Hosting check and setup  *(needs: your Hostinger access)*

- Confirm the Hostinger plan can run a Node.js app (VPS: yes; Business/Cloud web hosting:
  check "Node.js" in hPanel; basic shared plans may not).
- Create the subdomain (e.g. `app.sahaagency.com`) with Hostinger's free SSL.
- Create the private data folder and the environment-variable file.
- Set up deployment from GitHub to Hostinger (Git deploy in hPanel, or SSH on a VPS).

**Done when:** a "Hello from Ezly" page loads at the subdomain over HTTPS.

### Segment 1 — JSON storage layer  ✅ *done 2026-10-27*

- Replace Prisma/PostgreSQL with a `packages/store` module: collections (agencies, users,
  accounts, applications, quotes, policies, tasks, documents, audit log) stored as JSON.
- Safe writes (lock + temp file + rename), schema validation, field encryption, indexes
  kept in memory for fast search.
- Seed script with fake data; automated tests for crash safety, encryption and
  concurrent writes.

**Done when:** tests pass and the existing dashboard/accounts pages read from JSON.

### Segment 2 — Logins, roles and security basics  ✅ *done 2026-10-27*

- Sign-in with email + password (Argon2 hashing), **required MFA** with an authenticator
  app (free), session timeouts, lockout after failed attempts.
- Roles: Admin, Producer, CSR, Read-only; checks on every page and action.
- Audit log of logins and every change.
- Security headers and rate limiting.

**Done when:** staff can sign in with MFA, and each role sees only what it should.

### Segment 3 — Clients (Accounts)  ✅ *done 2026-10-27*

- Client list with search and filters (mockup: Accounts).
- New client form in steps with "required to save" vs "required to rate" checks and the
  "Ready to rate?" checklist (mockup: New client).
- Client page with sidebar and tabs: Overview, Details, Lead info, Activity (mockup:
  Account).
- CSV import with column matching and duplicate detection.

**Done when:** you can import a test list, find a client, edit them, and see the history.

### Segment 4 — Quoting  ✅ *done 2026-10-28*

- Home, Auto and Dwelling Fire application forms (drivers, vehicles, dwelling, coverages).
- Rate with the simulated insurers; results page with pay plans, sorting, errors and
  "fix & re-rate" (mockup: Quote results).
- Quote history on the client page; printable/emailable PDF proposal (generated on the
  server for free).

**Done when:** a producer can quote home and auto for a client and email the proposal.

### Segment 5 — Policies, tasks and renewals

- Bind a quote into a policy, or add a policy manually; Policies tab with totals.
- Tasks (overdue / today / upcoming) on the dashboard and client page.
- Nightly renewal check creating tasks at 60 and 30 days; dashboard tiles from real data
  (mockup: Dashboard).

**Done when:** the full flow works: lead → quote → bind → renewal reminder.

### Segment 6 — Documents and requests

- Upload, label and download documents per client (stored in the private data folder,
  type and size checks, downloaded only through the app).
- Underwriting requests with status and messages.

**Done when:** a CSR can attach a declarations page to a client and track a bind request.

### Segment 7 — Reports, settings and backups

- Reports: clients, book of business, quotes (quote-to-bind), renewals, activity, with CSV
  export (admins only).
- Settings: users, insurers, lead sources, labels.
- Automatic daily encrypted backups and a tested restore procedure.

**Done when:** the owner can run reports, manage staff, and a backup has been restored
successfully in a test.

### Segment 8 — Go-live with real data

- Security review against the go-live checklist (adapted for Hostinger).
- Move the agency's real clients in (from an EZLynx export or CSV).
- Staff training: logins, MFA, handling SSNs.

**Done when:** the owner signs off and staff use Ezly day to day.

### Later (when real insurers are ready)

- Texting from Ezly: built and switched off (see README "Text messages"). Turn on by adding a
  texting provider's settings; then add incoming replies and automatic STOP handling.

- Connect real insurers one at a time through the existing rating interface.
- Move from JSON to SQLite/PostgreSQL if size or speed requires it.

---

## What we need from Saha Agency

| Needed for | Item |
|---|---|
| Segment 0 | Which Hostinger plan you have, and access to set up the subdomain and deployment (you do the login; credentials are never shared in chat or git) |
| Segment 3 | A sample client export from EZLynx (with fake or removed SSNs) to design the import |
| Segment 4 | The insurers you're appointed with, the states you write, and which coverages your producers quote most |
| Segment 8 | Owner sign-off and the full client export |
