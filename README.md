# Ezly

Insurance agency management system with a built-in personal-lines comparative
rater. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Layout
| Path | What |
|---|---|
| `apps/web` | Next.js app (UI + API) |
| `packages/db` | Prisma schema, migrations, demo seed |
| `packages/rating` | `RatingAdapter` interface, simulated carriers, `rateAll` |
| `prototype/` | Original static click-through prototype |

## Getting started
Requires Node 22, pnpm 10 and Docker.

```sh
cp .env.example packages/db/.env
cp .env.example apps/web/.env
pnpm install
pnpm db:up          # Postgres + Redis
pnpm db:migrate
pnpm db:seed        # demo agency with 50 fake accounts
pnpm dev            # http://localhost:3000
```

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Carriers are simulated until real carrier connections are added: each real
carrier becomes a new `RatingAdapter` in `packages/rating`.
Never load real customer data into development databases.
