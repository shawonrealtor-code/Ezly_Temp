# Ezly — Option B: Managed Services Deployment

| | |
|---|---|
| Document | Deployment, Security & Operations Guide — Option B |
| System | Ezly agency management & comparative rating platform |
| Owner | Saha Agency (system owner) · Ezly engineering (maintainer) |
| Version | 1.0 — 2026-10-25 |
| Status | Approved for production use with real client data |
| Review cycle | Every 6 months, and after any incident or infrastructure change |
| Related | [TECHNICAL_SPEC](../TECHNICAL_SPEC.md) · [IMPLEMENTATION_PLAN](../IMPLEMENTATION_PLAN.md) · [Option A](./OPTION_A_ZERO_COST.md) |

---

## Contents

1. Purpose and scope
2. Design summary
3. Architecture
4. Services and components inventory
5. Cost model
6. Capacity and scaling
7. Environments
8. Provisioning procedure
9. Configuration reference
10. Build, release and deployment (CI/CD)
11. Security controls
12. Backup and disaster recovery
13. Monitoring, logging and alerting
14. Migration from Option A
15. Operational runbooks
16. Maintenance schedule
17. Regulatory compliance and vendor management
18. Risk register
19. Go-live checklist
20. Appendices

---

## 1. Purpose and scope

This document defines how Ezly is hosted, secured and operated on **managed cloud
services** for production use with real consumer data. Providers operate the
servers, patch operating systems and databases, and run backups; Ezly engineering
operates the application, configuration and security controls on top.

**In scope:** infrastructure services, network, data storage, keys and secrets,
deployment, backups, monitoring, incident handling, compliance and vendor management.

**Out of scope:** application features (see TECHNICAL_SPEC), carrier contracts,
agency business processes.

**Audience:** maintainers, the agency owner, auditors, carrier and client security
reviewers.

### 1.1 Shared responsibility

| Layer | Provider responsible | Ezly responsible |
|---|---|---|
| Data centers, hardware, hypervisor | ✔ | |
| Operating system and runtime patching (Render, Neon, Redis) | ✔ | Choosing supported versions |
| Database availability, replication, PITR storage | ✔ (Neon) | Configuring retention, testing restores |
| Network edge, DDoS, TLS certificates | ✔ (Cloudflare, Render) | Correct DNS/WAF/TLS settings |
| Application code, dependencies, authorization, tenant isolation | | ✔ |
| Identity and access to all consoles | | ✔ |
| Field-level encryption and key usage | AWS KMS stores the key | ✔ uses it correctly |
| Logs, alerts, incident response | Tools provided | ✔ |
| Regulatory compliance of the agency | | ✔ (agency) |

---

## 2. Design summary

| Concern | Choice | Reason |
|---|---|---|
| Application hosting | **Render** — Web Service (`web`) + Background Worker (`worker`), Docker deploys | Runs long-lived workers (needed for BullMQ, which serverless hosts cannot), private networking, zero-downtime deploys, SOC 2 Type II |
| Database | **Neon** serverless PostgreSQL 16 (Launch plan) | Managed Postgres, point-in-time restore, instant branches for staging/testing, SOC 2 Type II |
| Queue / cache | **Render Key Value** (Redis-compatible) on the private network | Not exposed to the internet; same region as app |
| File storage | **Cloudflare R2** | S3-compatible, no egress fees, encryption at rest |
| Edge | **Cloudflare** (free plan) in front of Render | DNS, WAF, rate limiting, DDoS, Access for admin/staging |
| Key management | **AWS KMS** (one customer-managed key) | Hardware-backed (FIPS 140-validated) master key for field encryption; full key-use audit trail in CloudTrail |
| Email | **Postmark** | High deliverability, delivery/bounce webhooks, message retention controls |
| SMS (optional) | **Twilio** | Reminders and two-way texting; 10DLC registration required |
| Errors | **Sentry** (Team plan recommended, Developer plan acceptable) | Error tracking with PII scrubbing |
| Logs & uptime | **Better Stack** (Render log stream + uptime monitors) | Centralized searchable logs, status page |
| Secrets | Render environment groups + 1Password/Bitwarden for break-glass | No secrets in code or images |
| CI/CD | **GitHub Actions** + Render deploy hooks | Same pipeline as Option A |

Region: all services in **US East** (Render Virginia/Ohio, Neon `us-east-1`/`us-east-2`,
AWS `us-east-1`) to keep data in the US and latency low.

---

## 3. Architecture

### 3.1 Deployment diagram

```
                    Staff browsers (HTTPS)
                             │
               ┌─────────────▼──────────────┐
               │ Cloudflare                  │
               │ DNS · WAF · rate limit ·    │
               │ DDoS · Access (staging)     │
               └─────────────┬──────────────┘
                             │ HTTPS (origin locked to Cloudflare)
 ┌───────────────────────────▼───────────────────────────────────────────┐
 │ Render (US East) — private network                                     │
 │  ┌──────────────────┐   enqueue   ┌───────────────┐                    │
 │  │ web (Next.js)    │────────────▶│ Key Value     │◀───┐               │
 │  │ ≥2 instances,    │             │ (Redis, priv.)│    │               │
 │  │ autoscale        │             └───────────────┘    │               │
 │  └───────┬──────────┘                           ┌──────┴───────────┐   │
 │          │                                      │ worker (BullMQ)  │   │
 │          │                                      │ rating, imports, │   │
 │          │                                      │ renewals, email  │   │
 │          │                                      └──────┬───────────┘   │
 └──────────┼─────────────────────────────────────────────┼───────────────┘
            │ TLS (verify-full)                            │
     ┌──────▼──────────────────┐        ┌──────────────────┼──────────────────────────┐
     │ Neon PostgreSQL 16      │        │ AWS KMS (key unwrap, CloudTrail logged)      │
     │ primary + PITR history  │        │ Cloudflare R2 (documents, versioned)         │
     │ branch: staging         │        │ Carrier rating APIs · Postmark · Twilio      │
     └─────────────────────────┘        │ Google Maps · Sentry · Better Stack          │
                                        │ Scanning: ClamAV sidecar private service     │
                                        └──────────────────────────────────────────────┘
```

### 3.2 Trust boundaries

| Boundary | Control |
|---|---|
| Internet → Cloudflare | TLS 1.2+, WAF managed rules, rate limits, bot protection |
| Cloudflare → Render | Render custom domain with TLS; origin accepts only Cloudflare (header secret checked by app middleware, Render IP allow-list where available) |
| Render services ↔ Key Value / ClamAV | Render private network only; no public endpoint |
| Render → Neon | TLS `sslmode=verify-full`, dedicated database roles, strong passwords; Neon IP allow-list when on a plan that supports it |
| App → AWS KMS | IAM user restricted to `kms:Decrypt` on one key (or IAM Roles Anywhere), all calls logged |
| Admin consoles | SSO/MFA on every provider; least-privilege team roles |

### 3.3 High availability

- `web` runs **at least 2 instances** behind Render's load balancer; deploys are
  zero-downtime (new instances must pass health checks before old ones stop).
- `worker` runs 1–2 instances; jobs are durable in Redis and retried with back-off.
- Neon separates storage (replicated across availability zones) from compute; compute
  restarts automatically on failure.
- Cloudflare provides a global edge; Render and Neon publish status pages monitored by
  Better Stack.

---

## 4. Services and components inventory

| Service | Plan (launch) | Purpose | Security attestations to collect yearly |
|---|---|---|---|
| Render | Professional workspace; `web` Standard ×2, `worker` Starter, Key Value Starter, ClamAV private service Starter | Hosting | SOC 2 Type II, DPA |
| Neon | Launch | PostgreSQL, PITR, branching | SOC 2 Type II, DPA |
| Cloudflare | Free (upgrade to Pro for advanced WAF if needed) | DNS, WAF, R2 storage | SOC 2 Type II, ISO 27001, DPA |
| AWS | Pay as you go (KMS + CloudTrail only) | Field-encryption master key | SOC 2, FIPS 140 validation for KMS |
| Postmark | Basic | Email | SOC 2 (confirm), DPA |
| Twilio (optional) | Pay as you go | SMS | SOC 2, ISO 27001 |
| Sentry | Team (or Developer) | Error tracking | SOC 2 Type II |
| Better Stack | Free → paid if log volume grows | Logs, uptime, status page | SOC 2 Type II |
| GitHub | Team (or Free) | Code, CI, Dependabot, secret scanning | SOC 2 Type II |
| Google Maps Platform | Pay as you go (monthly credit) | Address autocomplete, geocoding | SOC 2, ISO 27001 |
| 1Password / Bitwarden | Teams | Break-glass secrets, recovery codes | SOC 2 Type II |

Software components are identical to Option A §4.2 (Next.js, Prisma, Auth.js,
BullMQ, ClamAV, Node.js 22 LTS), minus the self-managed host packages.

---

## 5. Cost model

Approximate monthly costs at launch for one agency (verify at signup; usage-based
items vary):

| Item | Low | Typical | Notes |
|---|---|---|---|
| Render `web` (2 × Standard) | $14 (2 × Starter, pilot only) | $50 | Standard gives 2 GB RAM per instance |
| Render `worker` (Starter) | $7 | $7 | |
| Render Key Value (Starter) | $10 | $10 | |
| Render ClamAV private service (Starter) | $7 | $7 | Can be disabled if a scanning API is used instead |
| Render workspace (Professional) | $0 (Hobby) | $19 per member | Needed for team members, private networking features, audit logs |
| Neon Launch | ~$5 | ~$19 | Usage-based compute + storage |
| Cloudflare (DNS, WAF, R2) | $0 | $1–2 | R2: $0.015/GB-month beyond 10 GB |
| AWS KMS + CloudTrail | $1 | $1 | $1/key/month + negligible requests |
| Postmark | $15 | $15 | 10,000 emails/month |
| Sentry | $0 | $26 | Team plan for 2+ users and longer retention |
| Better Stack | $0 | $0 | Free tier covers launch volume |
| Twilio SMS | $0 | $5–20 | Optional; plus one-time 10DLC registration fees |
| **Total** | **≈ $60** | **≈ $155–175** | Pilot vs. hardened production with team plans |

A minimal configuration that keeps all security controls (single `web` Starter,
Hobby workspace, Sentry free, no SMS) is **≈ $50–60/month**. The "typical" column adds
redundancy (2 web instances), team features and longer retention.

**Cost controls:** spending alerts on Render, Neon, AWS (Budgets: $5), Twilio and Google
Cloud; monthly review of the invoice against this table.

---

## 6. Capacity and scaling

| Load | Action |
|---|---|
| Launch (1 agency, ≤ 25 staff) | Plans in §4 |
| CPU > 70% sustained on `web` | Enable Render autoscaling (2–4 instances) |
| Rating queue wait > 30 s | Add worker instance or raise concurrency |
| Database CPU > 70% / slow queries | Increase Neon compute size; review indexes (`pg_stat_statements`) |
| Multiple agencies (SaaS) | Neon Scale plan (IP allow-list, longer PITR, higher limits); Render autoscaling; Cloudflare Pro WAF |

Performance targets match TECHNICAL_SPEC §8 (list pages < 1.5 s p95, search < 300 ms,
full rating run < 30 s).

---

## 7. Environments

| Environment | Hosting | Database | Data | Access |
|---|---|---|---|---|
| Development | Local Docker Compose | Local Postgres | Fake | Developer |
| Preview (per pull request, optional) | Render preview environment | Neon branch from `staging` | Fake | Engineering via Cloudflare Access |
| Staging | Render (separate services, Starter sizes) | Neon branch `staging` (reset from seed, **never from production**) | Fake | Engineering via Cloudflare Access |
| Production | Render | Neon `main` branch | Real | Agency staff |

Each environment has its own Render environment group, R2 bucket, KMS key (staging
uses a separate key), Postmark server (staging uses a sandbox server that never
delivers to real addresses), and Sentry environment tag.

---

## 8. Provisioning procedure

Estimated time: 3–4 hours. Record completion in the go-live checklist (§19).

### 8.1 Accounts and identity

1. Use the organization email (e.g. `it@sahaagency.com`) for every provider.
2. Enable MFA (authenticator app or security key) on all accounts; enforce MFA for all
   team members where the provider supports it (Render, GitHub, Cloudflare, Neon,
   AWS, Sentry). Store recovery codes in the password manager.
3. Invite team members with the least privileged role that works; no shared logins.
4. AWS: create the account, enable MFA on root, lock root credentials away, create an
   admin IAM user/SSO for humans, and enable **CloudTrail** (management + KMS data
   events) to an encrypted S3 bucket with 1-year retention.
5. Configure billing alerts on every provider (§5).

### 8.2 Database (Neon)

1. Create project `ezly`, region US East, Postgres 16.
2. Set **history retention** (PITR window) to the plan maximum (7 days on Launch).
3. Create roles: `ezly_migrator`, `ezly_app`, `ezly_readonly` (Appendix B of Option A
   applies unchanged). The owner role is used only for break-glass.
4. Create branch `staging` from an **empty** schema; it is seeded with fake data only.
5. Connection strings use the pooled endpoint for `web`/`worker` and the direct endpoint
   for migrations, both with `sslmode=verify-full`.
6. Enable IP allow-list (Render outbound IPs) if the plan supports it; otherwise rely on
   TLS + credentials + role restrictions and record as accepted risk until upgrade.

### 8.3 Key management (AWS KMS)

1. Create symmetric customer-managed key `alias/ezly-prod-field-kek` (and
   `alias/ezly-staging-field-kek`), automatic yearly rotation **on**.
2. Key policy: administrators may manage; only IAM principal `ezly-prod-app` may call
   `kms:Decrypt` and `kms:GenerateDataKey`; deny everything else.
3. Generate the DEK with `GenerateDataKey`; store only the **ciphertext blob** in
   `FIELD_DEK_WRAPPED`. The app decrypts it at start-up and holds the plaintext DEK in
   memory only.
4. Create a CloudWatch alarm on unexpected `Decrypt` call volume or errors.

### 8.4 Storage (Cloudflare R2)

1. Buckets: `ezly-documents-prod`, `ezly-documents-staging`, `ezly-exports-prod`
   (lifecycle: delete after 7 days).
2. Enable **object versioning**/retention for documents (lifecycle: delete non-current
   versions after 90 days).
3. Bucket-scoped API tokens per environment; no public access; CORS limited to the app
   origin for direct presigned uploads.

### 8.5 Render

1. Create workspace `Saha Agency`; enable team MFA enforcement and audit log.
2. Create **environment groups** `ezly-prod` and `ezly-staging` holding all variables (§9).
3. Create private service **Key Value** (`maxmemory-policy noeviction`, required for
   BullMQ), private service **clamav**, web service **web** (Docker, health check
   `/api/health`, 2 instances, autoscaling optional), background worker **worker**.
4. Enable **pre-deploy command**: `pnpm --filter @ezly/db exec prisma migrate deploy`
   (uses `DATABASE_MIGRATE_URL`).
5. Disable auto-deploy on production services (deploys come from the release workflow,
   §10); keep auto-deploy on staging.
6. Add custom domain `app.<domain>` to `web`.

### 8.6 Cloudflare

1. DNS: `app` CNAME → Render hostname, **proxied**. SSL mode **Full (strict)**,
   minimum TLS 1.2, HSTS (1 year, include subdomains) after verification.
2. WAF managed ruleset on; rate-limit `/api/auth/*` (10/min/IP); bot fight mode.
3. Add a Transform Rule that sets a secret header (`X-Origin-Auth`) on requests to the
   origin; the app rejects requests without it, so Render's default `onrender.com` URL
   cannot bypass Cloudflare. Disable the default Render subdomain where possible.
4. Cloudflare Access on `staging.<domain>` and any admin tooling.

### 8.7 Email, SMS, monitoring

1. Postmark: separate **servers** for production and staging; verify the sending
   domain with **SPF, DKIM, DMARC** (`p=quarantine` then `p=reject`), configure
   bounce/delivery webhooks to `/api/webhooks/postmark` (signature verified).
2. Twilio (optional): register A2P 10DLC brand and campaign before sending.
3. Sentry: project `ezly`, environments `production`/`staging`, server-side data
   scrubbing on (default + custom rules for SSN/DL patterns), IP collection off.
4. Better Stack: add Render log stream (syslog/TLS) for all services; uptime monitors
   for `/api/health` (1-minute interval) and the login page; public or private status page.

### 8.8 Verification

| Check | Expected |
|---|---|
| `https://app.<domain>` | 200 via Cloudflare, HSTS header |
| Direct request to `*.onrender.com` | Rejected (403) |
| Key Value / ClamAV from outside | Not reachable (no public endpoint) |
| Neon connection without TLS | Refused |
| App start-up log | "Field key loaded" with no key material logged; CloudTrail shows one `Decrypt` |
| Deploy with a failing health check | Previous version keeps serving |
| PITR restore to a branch (RB-04) | Branch created at chosen time and queryable |

---

## 9. Configuration reference

Variables live in Render environment groups (encrypted at rest by Render, visible only
to workspace admins). A sealed copy is kept in the password manager.

| Variable | Secret | Example / format | Purpose |
|---|---|---|---|
| `NODE_ENV` | | `production` | Runtime mode |
| `APP_URL` | | `https://app.sahaagency.com` | Absolute links, cookies |
| `DATABASE_URL` | yes | Neon pooled URL, role `ezly_app`, `sslmode=verify-full` | App connections |
| `DATABASE_MIGRATE_URL` | yes | Neon direct URL, role `ezly_migrator` | Pre-deploy migrations |
| `REDIS_URL` | yes | Render Key Value internal URL | Queue, rate limits |
| `AUTH_SECRET` | yes | 32+ random bytes | Session signing |
| `AUTH_GOOGLE_ID` / `_SECRET`, `AUTH_MICROSOFT_ID` / `_SECRET` | yes | — | Optional SSO |
| `KMS_KEY_ID` | | `alias/ezly-prod-field-kek` | Master key |
| `AWS_REGION` | | `us-east-1` | KMS region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | IAM `ezly-prod-app` | KMS decrypt only |
| `FIELD_DEK_WRAPPED` | yes | base64 ciphertext blob | Wrapped data key |
| `S3_ENDPOINT`, `S3_BUCKET` | | R2 endpoint, `ezly-documents-prod` | Documents |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | Bucket-scoped | Documents |
| `ORIGIN_AUTH_SECRET` | yes | random | Must match Cloudflare header |
| `POSTMARK_SERVER_TOKEN` | yes | — | Email |
| `POSTMARK_WEBHOOK_SECRET` | yes | — | Verify webhooks |
| `EMAIL_FROM` | | `Saha Agency <no-reply@sahaagency.com>` | Sender |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | yes | — | Optional SMS |
| `GOOGLE_MAPS_API_KEY` | yes | Domain + API restricted | Address lookup |
| `SENTRY_DSN` | | — | Errors |
| `CLAMAV_HOST` | | `clamav:3310` (private) | Upload scanning |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | | `30` / `12` | Session limits |
| `RATING_ADAPTERS` | | comma-separated keys | Enabled carriers |
| Carrier credentials (`CARRIER_<KEY>_*`) | yes | per carrier | Real rating connections |

Rotation: yearly, on staff departure, or immediately after suspected exposure (RB-07).
AWS keys for the app are rotated every 90 days (or replaced by IAM Roles Anywhere).

---

## 10. Build, release and deployment (CI/CD)

| Stage | Trigger | Steps | Gate |
|---|---|---|---|
| Verify | Every push / PR | Install (frozen lockfile), lint, typecheck, unit tests, build, migration check on a Neon throwaway branch | All green |
| Security | Every PR + weekly | Dependabot, `pnpm audit --prod`, secret scanning + push protection, CodeQL/Semgrep, container image scan (Trivy) | No high/critical |
| Package | Merge to `main` | Build Docker image (amd64), tag with SHA, push to GHCR | Build passes |
| Staging | After package | Render deploy hook (staging) with image tag; E2E tests (Playwright) against staging | E2E green |
| Release | `git tag vX.Y.Z` | Changelog; image re-tagged | Maintainer approval |
| Production | Manual workflow with version | Neon **pre-release branch snapshot** → Render deploy (pre-deploy migration) → zero-downtime rollout → smoke tests | GitHub Environment approval by owner or maintainer |

Migrations follow **expand-then-contract** (see Option A §9.2). Rollback is redeploying
the previous image (Render "rollback" button or workflow); the pre-release Neon branch
is kept 7 days as an additional restore point.

Deployment windows and emergency rules are the same as Option A §9.3.

---

## 11. Security controls

Application-level controls are identical to Option A, and this section references them
rather than repeating them:

| Control area | Reference | Option B differences |
|---|---|---|
| Data classification | Option A §10.1 | — |
| Identity, MFA, sessions, roles, tenant isolation (RLS) | Option A §10.2 | Provider consoles: SSO/MFA enforced at workspace level |
| Application security (ASVS L2, validation, CSP, CSRF, rate limits, uploads) | Option A §10.5 | ClamAV runs as a Render private service |
| Audit logging | Option A §10.6 | Logs stream to Better Stack; KMS usage in CloudTrail |
| Secure development | Option A §10.9 | — |

### 11.1 Network security

- Only `web` has a public endpoint, and it only accepts requests carrying the
  Cloudflare origin secret.
- Redis and ClamAV have no public endpoints (Render private network).
- Database connections require TLS with certificate verification; the application role
  cannot alter schema or bypass RLS.
- Outbound calls are to an allow-listed set of hosts enforced in the HTTP client layer
  (carrier endpoints, Postmark, Twilio, KMS, R2, Google, Sentry).

### 11.2 Encryption and key management

| Data | At rest | In transit |
|---|---|---|
| Database (incl. PITR history) | Neon storage encryption (AES-256) | TLS 1.2+ verify-full |
| SSN, DL #, bank details | **Additionally** AES-256-GCM per field with DEK wrapped by AWS KMS | TLS |
| Redis | Render disk encryption; contains job metadata only (no Restricted fields — enforced by job payload schema) | Private network |
| Documents | R2 AES-256 | TLS, 5-minute signed URLs |
| Logs | Better Stack / Sentry encryption at rest; Restricted fields scrubbed before sending | TLS |

KMS key rotation is automatic yearly; DEK rotation every 2 years or on suspicion of
compromise (RB-07). Every unwrap is recorded in CloudTrail, giving an auditable trail of
key use.

### 11.3 Vulnerability and patch management

| Item | Owner | Frequency / SLA |
|---|---|---|
| OS, database engine, Redis patches | Providers | Continuous |
| Base image (Node 22 slim) | Ezly | Rebuilt weekly; critical CVE within 72 h |
| npm dependencies | Ezly | Dependabot daily; critical 7 days, high 30 days |
| Container image scan (Trivy) | Ezly | Every build; high/critical block release |
| DAST (OWASP ZAP) against staging | Ezly | Monthly and before each release |
| Independent penetration test | Third party | Before go-live with multiple agencies, then yearly |

### 11.4 Secrets management

- Secrets only in Render environment groups, GitHub Environment secrets (deploy hooks),
  and the password manager.
- Render environment group edits are restricted to admins and appear in the workspace
  audit log.
- GitHub push protection and secret scanning enabled; pre-commit hook blocks `.env` files.

---

## 12. Backup and disaster recovery

### 12.1 Objectives

| Metric | Target |
|---|---|
| RPO | ≤ 1 minute (Neon continuous WAL history) |
| RTO | ≤ 1 hour |
| Availability | 99.9% monthly |

### 12.2 What is protected

| Asset | Mechanism | Retention |
|---|---|---|
| Database | Neon point-in-time history | 7 days (Launch); longer on Scale |
| Database (independent copy) | Nightly `pg_dump -Fc` by a scheduled GitHub Action / Render cron job, encrypted with `age`, uploaded to a separate R2 bucket in a **separate Cloudflare account** with object lock | 35 daily + 12 monthly |
| Pre-release snapshots | Neon branch created before each production deploy | 7 days |
| Documents | R2 versioning + weekly sync to the backup account bucket | 90 days of versions |
| Configuration | Render env groups (exported, encrypted) + git | On change |
| Redis | Rebuildable; jobs re-enqueued from database state on recovery | n/a |

The independent nightly copy protects against provider-account compromise or
deletion — a scenario PITR alone does not cover.

### 12.3 Restore testing

- **Monthly:** create a Neon branch at a random point in the last 7 days; run integrity
  checks; delete the branch. Record time taken.
- **Quarterly:** restore the latest nightly `pg_dump` into a scratch database; start a
  staging instance against it; verify login and a known record; record RTO.
- Failed tests are Severity 2 incidents.

### 12.4 Disaster scenarios

| Scenario | Response |
|---|---|
| Instance crash | Render replaces instance automatically |
| Bad deploy | RB-02 rollback (minutes) |
| Accidental deletion / bad migration | RB-04: Neon branch at time before event; copy back or promote |
| Neon regional outage | Wait for provider recovery, or RB-05: restore nightly dump to a new Neon project in another region / Render Postgres |
| Render outage | Wait; for long outages deploy the same image to an alternate host (Fly.io, AWS ECS) using the documented env vars |
| Provider account compromise | IR-01 + restore from the separate-account backup bucket |

---

## 13. Monitoring, logging and alerting

| Signal | Source | Threshold | Alert |
|---|---|---|---|
| Availability | Better Stack uptime (1 min) | 2 failures | Email, SMS/push, on-call |
| Error rate | Sentry | > 1% of requests or new auth/permission errors | Email/Slack |
| Latency | Render metrics | p95 > 1.5 s for 10 min | Email |
| Instance health | Render | Restarts > 3/hour, memory > 90% | Email |
| Database | Neon metrics | CPU > 80%, storage > 80% of plan, connections > 80% | Email |
| Queue | BullMQ metrics endpoint | Failed > 10/hour, waiting > 500 | Email |
| Security | Audit log + CloudTrail | Failed logins > 20/hour; KMS decrypt errors; admin role changes; data exports | Email to admin |
| Backups | Nightly dump job | Job failed or file missing | Email |
| Spend | Provider budgets | Above monthly plan | Email |

Logs: Render log streams → Better Stack (30-day retention), with a scrubbing transform
for SSN/DL/email/phone patterns. Audit log in the database retained 7 years.

---

## 14. Migration from Option A

Expected downtime: ≤ 30 minutes. Perform in a deployment window.

1. **Prepare (days before):** provision Option B fully (§8) using staging data; run E2E
   tests on Option B staging. Lower Cloudflare DNS TTL for `app` to 60 s.
2. **Keys:** decrypt the Option A DEK (Oracle Vault) and re-wrap it with AWS KMS, or
   generate a new DEK and run the re-encryption job after migration (preferred: new DEK).
3. **Freeze:** put Option A into maintenance mode (app shows a notice; writes blocked).
4. **Export:** `pg_dump -Fc` from Option A; verify checksum.
5. **Import:** `pg_restore` into Neon `main` using the owner role; re-apply role grants and
   RLS policies; run `prisma migrate status` (must report up to date).
6. **Files:** documents are already in R2 — point Option B at the same bucket or copy with
   `rclone sync`.
7. **Verify:** row counts per table match; spot-check 5 clients; log in as each role.
8. **Cut over:** switch Cloudflare DNS for `app` to Render; disable the Option A tunnel.
9. **Post-migration:** run the DEK re-encryption job if a new DEK was created; keep Option A
   stopped (not deleted) and its backups for 30 days; then securely destroy the VM and
   volumes and record the destruction.

---

## 15. Operational runbooks

**RB-01 Deploy** — GitHub → Actions → "Deploy production" → version → approve → watch
Render deploy and smoke tests.

**RB-02 Roll back** — Render dashboard → service → Deploys → "Rollback" to the previous
deploy, or run the workflow with the previous version. Never run down-migrations.

**RB-03 Scale** — Render → `web` → instances/autoscaling; Neon → compute size. Record change.

**RB-04 Point-in-time recovery** — Neon → Branches → create branch from `main` at
timestamp → verify data → either copy affected rows back (preferred) or set the branch as
primary and update `DATABASE_URL` (requires restart). Log the action in the audit log.

**RB-05 Restore from independent backup** — create new Neon project → `pg_restore` latest
nightly dump → grants/RLS → update env vars → redeploy.

**RB-06 Rotate secrets** — generate new value → update Render env group → redeploy → revoke
old value at the provider → update password manager.

**RB-07 Rotate data key** — `GenerateDataKey` → set `FIELD_DEK_WRAPPED_NEXT` → deploy →
run `pnpm ezly:reencrypt` (batched, idempotent, resumable) → promote to
`FIELD_DEK_WRAPPED` → remove old.

**RB-08 Offboard staff** — disable user in Ezly (sessions revoked); remove from Render,
GitHub, Cloudflare, Neon, AWS, Sentry, Better Stack, password manager; rotate any secrets
they had access to.

**RB-09 Provider incident** — check provider status page; post internal notice; follow
§12.4; record timeline.

**IR-01 Security incident response** — identical process to Option A §13 IR-01 (detect,
contain, investigate, eradicate/recover, notify, review), plus: request provider logs and
cooperation under the DPA; preserve CloudTrail, Render audit log and Neon branch at time
of discovery as evidence.

---

## 16. Maintenance schedule

| Frequency | Task |
|---|---|
| Daily (automatic) | Nightly independent backup; alert review |
| Weekly | Review Sentry, failed jobs, Dependabot PRs; rebuild base image |
| Monthly | PITR restore test; ZAP scan of staging; invoice review against §5; review Render/Neon/AWS audit logs |
| Quarterly | Full restore drill from nightly dump; access review across all providers and Ezly roles; review allow-lists |
| Yearly | Collect vendor SOC 2 reports and DPAs (§17.2); risk assessment; penetration test; rotate long-lived secrets; staff security training; review this document |

---

## 17. Regulatory compliance and vendor management

### 17.1 Compliance mapping

The same frameworks as Option A apply (GLBA Safeguards Rule; Maryland and Virginia
insurance data security laws based on NAIC Model #668; state breach-notification laws).
The control mapping in Option A §15 applies with these references:

| Requirement | Option B control |
|---|---|
| Encryption at rest/in transit | §11.2 |
| MFA | Option A §10.2 + provider console MFA (§8.1) |
| Logging and monitoring | §13; CloudTrail for key use |
| Change management | §10 |
| Penetration testing / vulnerability assessment | §11.3 |
| Incident response | §15 IR-01 |
| Business continuity | §12 |
| Service-provider oversight | §17.2 |

*Technical guidance, not legal advice; confirm obligations and deadlines with counsel.*

### 17.2 Vendor management

For every provider in §4, maintain a vendor record with: services used, data stored
(classification), region, signed Data Processing Agreement, latest SOC 2 / ISO report
(date reviewed and reviewer), breach-notification commitment, and exit plan. Review
yearly. A provider that stores Restricted or Confidential data and cannot supply a
current attestation must be replaced or formally risk-accepted by the owner.

### 17.3 Preparing for SOC 2 (if Ezly is sold to other agencies)

Option B is designed so most SOC 2 evidence comes from existing tools: GitHub (change
management), Render/Neon/AWS audit logs (access and infrastructure), Better Stack and
Sentry (monitoring), restore-test records (availability), and the access reviews in §16.
A compliance automation platform and an auditor are separate costs at that stage.

---

## 18. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Provider outage (Render/Neon/Cloudflare) | Low | High | Multi-instance web; status monitoring; independent backups; alternate-host runbook | Low |
| R2 | Provider account compromise | Low | High | MFA, least privilege, audit logs, separate-account backups | Low |
| R3 | Credential theft from staff | Medium | High | MFA, session limits, alerts | Low |
| R4 | Vulnerable dependency | Medium | High | Dependabot, Trivy, SLAs | Low |
| R5 | Database reachable from internet (no IP allow-list on lower Neon plans) | Medium | Medium | TLS verify-full, strong unique credentials, least-privilege roles; upgrade to plan with IP allow-list when serving multiple agencies | Low–Medium |
| R6 | Cost overrun | Medium | Low | Budgets and monthly review | Low |
| R7 | Cross-agency data leak | Low | High | RLS + isolation tests | Low |
| R8 | Vendor lock-in | Low | Medium | Standard Postgres, S3 API, Docker image; documented alternatives | Low |
| R9 | Insider misuse | Low | High | Least privilege, reveal logging, quarterly reviews | Low |

---

## 19. Go-live checklist

- [ ] All provider accounts on organization email, MFA enforced, recovery codes stored
- [ ] Billing alerts active on every provider
- [ ] Neon roles created; app role cannot bypass RLS; TLS verify-full confirmed
- [ ] KMS key policy restricts decrypt to the app principal; CloudTrail on
- [ ] Render private services have no public endpoints; `onrender.com` origin blocked
- [ ] Cloudflare Full (strict), HSTS, WAF and rate limits active
- [ ] SSL Labs A, securityheaders.com A
- [ ] OWASP ZAP baseline and Trivy: no high/critical findings
- [ ] Tenant isolation test suite passing
- [ ] PITR restore test and independent-dump restore test recorded with measured RTO/RPO
- [ ] All alerts triggered once and received
- [ ] SPF/DKIM/DMARC passing; Postmark staging server cannot reach real addresses
- [ ] Vendor records (§17.2) complete with DPAs and attestations
- [ ] Incident contacts filled in (Option A Appendix C template)
- [ ] Staff trained (phishing, MFA, Restricted data handling)
- [ ] Owner sign-off

---

## 20. Appendices

### Appendix A — Render blueprint (`render.yaml`, reference)

```yaml
services:
  - type: web
    name: ezly-web
    runtime: image
    image: { url: ghcr.io/<org>/ezly:${EZLY_VERSION} }
    plan: standard
    numInstances: 2
    region: virginia
    healthCheckPath: /api/health
    preDeployCommand: pnpm --filter @ezly/db exec prisma migrate deploy
    envVars: [{ fromGroup: ezly-prod }]
  - type: worker
    name: ezly-worker
    runtime: image
    image: { url: ghcr.io/<org>/ezly:${EZLY_VERSION} }
    dockerCommand: node workers/dist/index.js
    plan: starter
    region: virginia
    envVars: [{ fromGroup: ezly-prod }]
  - type: pserv
    name: clamav
    runtime: image
    image: { url: docker.io/clamav/clamav:stable }
    plan: starter
    region: virginia
  - type: keyvalue
    name: ezly-redis
    plan: starter
    region: virginia
    maxmemoryPolicy: noeviction
    ipAllowList: []   # private network only
envVarGroups:
  - name: ezly-prod   # values set in the dashboard, never committed
```

(Final files are produced in Phase 7 of the implementation plan; field names follow
Render's blueprint specification at that time.)

### Appendix B — Database roles

Identical to Option A Appendix B.

### Appendix C — Vendor record template

| Field | Value |
|---|---|
| Vendor / service | |
| Data stored and classification | |
| Region | |
| DPA signed (date) | |
| Attestation (type, period, reviewed by, date) | |
| Breach-notification commitment | |
| Admin users | |
| Exit plan | |
| Next review | |
