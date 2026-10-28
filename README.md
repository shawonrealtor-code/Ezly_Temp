# Ezly

Insurance agency management system with a built-in personal-lines comparative
rater. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md),
[docs/operations/](docs/operations/README.md) (hosting, security, operations) and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Layout
| Path | What |
|---|---|
| `apps/web` | Next.js app (UI + server) |
| `packages/core` | Browser-safe client logic: "ready to rate" checklist, search, duplicate detection, CSV import parsing and column matching |
| `packages/auth` | Sign-in: Argon2id passwords, authenticator-app codes, recovery codes, sessions, lockout, roles and permissions |
| `packages/store` | JSON-file data storage: safe writes, locking, validation, SSN/DL encryption, agency isolation, audit log |
| `packages/messaging` | Text messages: provider interface (Twilio, development outbox), consent rules, phone formatting |
| `packages/rating` | Quote application schemas (auto, home, dwelling fire), `RatingAdapter` interface, 7 simulated insurers with realistic pricing factors and declines, `rateAll`, pay plans |
| `prototype/` | Original static click-through prototype |

## Getting started
Requires Node 22 and pnpm 10. No database server is needed.

```sh
pnpm install
cp .env.example apps/web/.env
pnpm keygen        # paste the output into EZLY_FIELD_KEY in apps/web/.env
EZLY_DATA_DIR=$PWD/.data EZLY_FIELD_KEY=<same key> pnpm seed   # demo agency, 50 fake clients
pnpm dev           # http://localhost:3000
```

Demo sign-ins (fake data only): `admin@demo.ezly`, `producer@demo.ezly`, `csr@demo.ezly`,
`viewer@demo.ezly`, password `Ezly-demo-pass-2026`. Each sets up an authenticator app on
first sign-in.

To create the real first admin on a server (password typed at a hidden prompt):

```sh
EZLY_DATA_DIR=... EZLY_FIELD_KEY=... pnpm create-user --agency-name "Saha Agency" \
  --email owner@example.com --name "Owner Name" --role ADMIN
```

### Sign-in and security
- Password (Argon2id, 12+ characters, common passwords refused) **plus** a 6-digit code from an
  authenticator app for every user; 10 one-time recovery codes for a lost phone.
- 5 wrong passwords lock the account for 15 minutes (doubling after that); per-IP rate limits.
- Sessions are stored on the server and end after 30 minutes idle or 12 hours. Changing a
  password, role, or two-step setup, or disabling a user, signs them out everywhere.
- Roles: Admin, Producer, CSR, Read-only (`packages/auth/src/permissions.ts`). Every page and
  server action checks its permission through `requireUser()` in `apps/web/src/lib/auth.ts`.
- Strict Content-Security-Policy with a per-request nonce (`apps/web/src/proxy.ts`) plus
  HSTS, frame, MIME-sniffing, referrer and permissions headers (`next.config.ts`). Cache
  Components / partial prerendering are off because nonces can't be added to prerendered pages.
- Admins manage users at **Users** and review sign-ins and changes at **Activity log**.

### Clients
- **Clients** list: search (name, email, phone, ZIP, policy #), filters, sorting, 25 per page.
- **New client**: four steps with a live "Ready to rate?" checklist; only first and last name are
  needed to save. Possible duplicates (same name + birth date, email, phone, or name + ZIP) are
  flagged before saving.
- Client page: Overview, Details, Lead info and Activity (notes, calls, and a full change history).
  Call / text / email buttons open the staff member's own phone or mail app (no texting fees).
- SSNs and license numbers are masked; admins can reveal one after giving a reason, which is logged.
- **Import** (admins): CSV from EZLynx or Excel, automatic column matching, a check step showing
  errors, cleaned-up values and likely duplicates, and **Undo this import**. Only mapped columns
  leave the browser. A template is at `apps/web/public/client-import-template.csv`.
- **Export CSV** (admins): never includes SSNs or license numbers; every export is logged.

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

### Data storage
Data is kept as JSON files in `EZLY_DATA_DIR` (`collections/*.json` plus monthly
`audit/*.jsonl`). In production this folder must be **outside the public web folder**.
SSNs and driver's license numbers can only be saved encrypted. Keep `EZLY_FIELD_KEY`
in the password manager: without it those fields cannot be read.

### Quoting
- From a client's **Quotes** tab: start an auto, home or dwelling fire application. Drivers come
  from the household; the property is the client's address. Drafts save at any time; **Get
  quotes** lists anything missing, then rates every appointed insurer in the state.
- Results: pay in full / monthly / bank draft, sorting, coverage details, "vs best", and insurers
  that decline with the reason and **Fix & re-rate** (jumps to the field).
- **Proposal PDF** (generated on the server) and **Email proposal**; emailing is logged on the
  client's timeline.

### Company email
- Ezly sends only from **company mailboxes** on the company's domain (set by an admin on **Users**).
- Each employee's company mailbox is created in Hostinger and connected by an admin on **Users**
  (Ezly signs in to test it; the password is stored encrypted). Their proposals come from their
  company address, with a copy to that mailbox.
- Automatic emails, and staff without a connected mailbox, use the **shared company mailbox**
  (`EZLY_SMTP_*` / `EZLY_MAIL_FROM`); replies go to the employee.
- Every email is logged, and each mailbox is kept under `EZLY_MAIL_DAILY_LIMIT` per 24 hours;
  when an employee's mailbox is full Ezly uses the shared one, and stops with a clear message when
  that is full too.
- **Quotes** in the menu lists recent quote runs across all clients.

### Text messages (ready, switched off)
- Today the text button opens the staff member's own phone (free).
- Each client's **consent to receive texts** is recorded on the Details tab (when and how; turning
  it off records an opt-out). This is required by law (TCPA) before an agency texts a client.
- To switch on texting from Ezly later, set `EZLY_SMS_PROVIDER` and the provider settings in the
  server environment (see `.env.example`); no code changes. A "Send a text" box then appears on the
  client's Activity tab, only for clients who agreed, and every text is logged on the timeline.
  The business number must first be registered for business texting (A2P 10DLC).
- Not yet: receiving replies and automatic STOP handling (needs a webhook from the provider).

Insurers are simulated until real connections are added: each real insurer becomes a new
`RatingAdapter` in `packages/rating`, and the screens stay the same.
Never load real customer data into development data folders.
