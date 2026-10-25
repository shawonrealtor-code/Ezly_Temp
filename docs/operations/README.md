# Ezly — Deployment & Operations Documentation

Ezly can run in two ways. The application code is identical in both; only the
infrastructure underneath changes. Pick one with the comparison below, then
follow that option's document from start to finish.

| Document | Use it when |
|---|---|
| [Option A — Zero-Cost Self-Hosted](./OPTION_A_ZERO_COST.md) | Building, testing, piloting, or running a single small agency on $0/month and you accept owning server maintenance |
| [Option B — Managed Services](./OPTION_B_MANAGED.md) | Real client data in day-to-day production, or selling Ezly to other agencies |

## At a glance

| | Option A — Zero-Cost | Option B — Managed |
|---|---|---|
| Monthly cost | $0 (domain ~$12/yr if needed) | ~$60 minimal · ~$155–175 with redundancy and team plans |
| Where it runs | One Oracle Cloud "Always Free" virtual server | Render (app + worker), Neon (database), Upstash (Redis), Cloudflare R2 (files) |
| Who patches servers | You / your developer | The providers |
| Database backups | Self-run, nightly + continuous to R2 | Provider-managed, restore to any minute (7 days) |
| Recovery point (max data loss) | ≤ 5 minutes | ≤ 1 minute |
| Recovery time (back online) | ≤ 4 hours | ≤ 1 hour |
| Availability target | 99.5% (single server) | 99.9% |
| Scale ceiling | ~25 staff users, ~50k clients | Grows by changing plans |
| Ops effort | ~2–4 hours/month | ~30 minutes/month |
| Good for SOC 2 later | Possible, more evidence work | Easier; providers supply their own SOC 2 reports |

## Recommended path

1. **Now → pilot:** Option A with fake data, then with Saha Agency's real data once
   every item in Option A's go-live checklist is done.
2. **When any of these happen, move to Option B** (procedure in Option B, §14):
   more than one agency uses Ezly, more than ~25 staff, a client or carrier asks for
   security attestations, or nobody is available to maintain the server.

## Shared conventions (both options)

- **Configuration** comes only from environment variables (see each document's
  configuration reference). The same Docker image / build runs everywhere.
- **Environments:** `development` (local, fake data) → `staging` (fake data, same
  setup as production) → `production` (real data). Real data never leaves production.
- **Change control:** every change goes through a pull request with passing CI
  (lint, typecheck, tests, build) and one approving review before merge to `main`.
  Merges to `main` deploy to staging automatically; production deploys are a
  manual, recorded promotion.
- **Versioning:** releases are tagged `vMAJOR.MINOR.PATCH`; database migrations
  are forward-only and must be backward-compatible with the previous release.
- **Document control:** these documents are versioned in git. Review them at least
  every 6 months and after any incident or infrastructure change.

Prices and free-tier limits in these documents reflect providers' published
plans at the time of writing and change often. Confirm them at signup.
