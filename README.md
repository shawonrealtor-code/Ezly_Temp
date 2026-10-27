# Ezly

Insurance agency management system with a built-in personal-lines comparative
rater. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md),
[docs/operations/](docs/operations/README.md) (hosting, security, operations) and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Layout
| Path | What |
|---|---|
| `apps/web` | Next.js app (UI + server) |
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

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

### Data storage
Data is kept as JSON files in `EZLY_DATA_DIR` (`collections/*.json` plus monthly
`audit/*.jsonl`). In production this folder must be **outside the public web folder**.
SSNs and driver's license numbers can only be saved encrypted. Keep `EZLY_FIELD_KEY`
in the password manager: without it those fields cannot be read.

Carriers are simulated until real carrier connections are added: each real
carrier becomes a new `RatingAdapter` in `packages/rating`.
Never load real customer data into development data folders.
