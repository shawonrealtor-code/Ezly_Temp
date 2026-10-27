# Ezly

Insurance agency management system with a built-in personal-lines comparative
rater. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md),
[docs/operations/](docs/operations/README.md) (hosting, security, operations) and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Layout
| Path | What |
|---|---|
| `apps/web` | Next.js app (UI + server) |
| `packages/auth` | Sign-in: Argon2id passwords, authenticator-app codes, recovery codes, sessions, lockout, roles and permissions |
| `packages/store` | JSON-file data storage: safe writes, locking, validation, SSN/DL encryption, agency isolation, audit log |
| `packages/rating` | `RatingAdapter` interface, simulated carriers, `rateAll` |
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

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

### Data storage
Data is kept as JSON files in `EZLY_DATA_DIR` (`collections/*.json` plus monthly
`audit/*.jsonl`). In production this folder must be **outside the public web folder**.
SSNs and driver's license numbers can only be saved encrypted. Keep `EZLY_FIELD_KEY`
in the password manager: without it those fields cannot be read.

Carriers are simulated until real carrier connections are added: each real
carrier becomes a new `RatingAdapter` in `packages/rating`.
Never load real customer data into development data folders.
