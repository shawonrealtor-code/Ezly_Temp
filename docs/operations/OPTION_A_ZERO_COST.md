# Ezly — Option A: Zero-Cost Self-Hosted Deployment

| | |
|---|---|
| Document | Deployment, Security & Operations Guide — Option A |
| System | Ezly agency management & comparative rating platform |
| Owner | Saha Agency (system owner) · Ezly engineering (maintainer) |
| Version | 1.0 — 2026-10-25 |
| Status | Approved for development and pilot use |
| Review cycle | Every 6 months, and after any incident or infrastructure change |
| Related | [TECHNICAL_SPEC](../TECHNICAL_SPEC.md) · [IMPLEMENTATION_PLAN](../IMPLEMENTATION_PLAN.md) · [Option B](./OPTION_B_MANAGED.md) |

---

## Contents

1. Purpose and scope
2. Design summary
3. Architecture
4. Services and components inventory
5. Capacity, limits and free-tier constraints
6. Environments
7. Provisioning procedure
8. Configuration reference
9. Build, release and deployment (CI/CD)
10. Security controls
11. Backup and disaster recovery
12. Monitoring, logging and alerting
13. Operational runbooks
14. Maintenance schedule
15. Regulatory compliance mapping
16. Risk register
17. Go-live checklist
18. Upgrade path to Option B
19. Appendices

---

## 1. Purpose and scope

This document defines how Ezly is hosted, secured and operated at **zero recurring
cost**. It is the authoritative reference for anyone provisioning, deploying,
maintaining, auditing or recovering the system under Option A.

**In scope:** infrastructure, network, data storage, secrets, deployment, backups,
monitoring, incident handling, compliance controls.

**Out of scope:** application features (see TECHNICAL_SPEC), carrier contracts,
agency business processes.

**Intended audience:** developers and administrators maintaining Ezly; the agency
owner (approvals and accountability); auditors and carrier security reviewers.

### 1.1 Cost statement

All services below are used within permanent free plans. The only possible costs:

| Item | Cost | Avoidable? |
|---|---|---|
| Domain name | ~$12/year | Yes — use a subdomain of an existing domain (e.g. `app.sahaagency.com`) |
| Payment card on file (Oracle, Google Maps) | $0 charged | No — required for identity verification |
| Text messaging (SMS) | Per message | Yes — SMS is disabled in Option A |

Budget alerts at **$1** are configured on every account that holds a card (§7.1), so
any accidental charge is caught immediately.

---

## 2. Design summary

| Decision | Choice | Reason |
|---|---|---|
| Compute | One Oracle Cloud "Always Free" Ampere A1 VM (4 vCPU, 24 GB RAM, 200 GB disk) | Largest permanently free server available; enough for the whole stack |
| Packaging | Docker Compose, all services on the one VM | Simple, reproducible, identical to local development |
| Ingress | Cloudflare Tunnel (no open inbound ports) + Cloudflare free WAF | Server is invisible to the internet; DDoS and TLS handled by Cloudflare |
| Database | PostgreSQL 16 in a container on an encrypted block volume | Full control, no size limits beyond disk |
| Backups | WAL-G continuous archiving → Cloudflare R2 (encrypted) + Oracle volume backups | Off-site, point-in-time recovery, $0 |
| Files | Cloudflare R2 (10 GB free, no egress fees) | S3-compatible, off-server |
| Keys | Oracle Cloud Vault (software keys, free) for the master key | Encryption keys never stored on disk in plain text |
| Email | Resend free plan (3,000/month, 100/day) | Transactional email |
| Observability | Sentry free, Grafana Cloud free, UptimeRobot free | Errors, logs/metrics, uptime from outside |

**Trade-off accepted:** a single server is a single point of failure. This is
mitigated by off-site backups with tested restores (RTO ≤ 4 h, RPO ≤ 5 min) and is
acceptable for one agency. It is the main reason to move to Option B later.

---

## 3. Architecture

### 3.1 Deployment diagram

```
                        Internet (staff browsers, HTTPS only)
                                       │
                       ┌───────────────▼────────────────┐
                       │ Cloudflare (free)               │
                       │  DNS · TLS 1.2+ · WAF · DDoS    │
                       │  Rate limiting · Access (admin) │
                       └───────────────┬────────────────┘
                                       │ outbound-only encrypted tunnel
 ┌─────────────────────────────────────▼──────────────────────────────────────┐
 │ Oracle Cloud Always Free — VCN private subnet — Ubuntu 24.04 LTS (ARM)      │
 │ Security list: NO inbound rules except SSH from admin IP (optional)         │
 │                                                                             │
 │  docker network "ezly" (internal)                                           │
 │  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────────┐   │
 │  │ cloudflared│──▶│ web        │──▶│ postgres 16│◀──│ walg (backups)   │───┼──▶ R2 bucket
 │  └────────────┘   │ Next.js    │   │ (encrypted │   └──────────────────┘   │    ezly-backups
 │                   │ :3000      │   │  volume)   │                          │
 │                   └─────┬──────┘   └─────▲──────┘                          │
 │                         │ enqueue        │                                 │
 │                   ┌─────▼──────┐   ┌─────┴──────┐   ┌──────────────────┐   │
 │                   │ redis 7    │◀──│ worker     │──▶│ clamav (scan)    │   │
 │                   │ (AOF)      │   │ BullMQ     │   └──────────────────┘   │
 │                   └────────────┘   └─────┬──────┘                          │
 │  grafana-alloy (logs/metrics agent) ─────┼─────────────────────────────────┼──▶ Grafana Cloud
 └──────────────────────────────────────────┼─────────────────────────────────┘
                                            ├──▶ Cloudflare R2 (documents bucket)
                                            ├──▶ Carrier rating APIs (HTTPS)
                                            ├──▶ Resend (email) · Google Maps
                                            ├──▶ Oracle Vault (key unwrap)
                                            └──▶ Sentry (errors, PII scrubbed)
```

### 3.2 Trust boundaries

| Boundary | Control |
|---|---|
| Internet → Cloudflare | TLS 1.2+, WAF managed rules, bot fight mode, rate limits |
| Cloudflare → VM | Authenticated tunnel; VM accepts no unsolicited inbound traffic |
| Web/worker → database | Internal Docker network only; database port not published to host |
| App → external services | HTTPS only; per-service credentials with least privilege |
| Admin → VM | SSH keys only via Cloudflare Access (or IP-restricted), MFA enforced |

### 3.3 Request flow (example: run a quote)

1. Producer clicks **Get quotes**; browser → Cloudflare → tunnel → `web`.
2. `web` authenticates the session, checks role, sets the agency context, validates
   input with Zod, writes a `QuoteRun`, and enqueues one job per eligible carrier in Redis.
3. `worker` picks up jobs in parallel, calls each carrier adapter, stores each
   `CarrierQuote`, and publishes progress.
4. `web` streams results to the browser (Server-Sent Events) as each carrier returns.
5. Every write produces an `AuditLog` row.

---

## 4. Services and components inventory

### 4.1 Infrastructure services

| Service | Plan | Purpose in Ezly | Free allowance used | Alternative if lost |
|---|---|---|---|---|
| Oracle Cloud Infrastructure | Always Free (account upgraded to Pay-As-You-Go, see §7.1) | VM, block storage, Vault, volume backups | 1 A1 VM (4 OCPU/24 GB), 200 GB block storage, 5 volume backups, 20 Vault key versions | Hetzner CAX11 (~€4/mo) |
| Cloudflare | Free | DNS, TLS, WAF, Tunnel, Access (≤50 users), R2 | R2: 10 GB storage, 1M writes, 10M reads/month | Backblaze B2 (10 GB free) |
| GitHub | Free | Source, pull requests, Actions CI, Dependabot, secret scanning | 2,000 Actions min/month (private repo) | GitLab Free |
| Resend | Free | Transactional email | 3,000/month, 100/day | Brevo free (300/day) |
| Google Maps Platform | Monthly free credit | Address autocomplete, geocoding, county lookup | Within monthly credit at agency volume | OpenStreetMap Nominatim (self-hosted) |
| Sentry | Developer (free) | Application error tracking | 5,000 errors/month, 1 user | GlitchTip (self-hosted) |
| Grafana Cloud | Free | Log and metric storage, dashboards, alerts | 50 GB logs, 10k metric series, 14-day retention | Self-hosted Loki on the VM |
| UptimeRobot | Free | External uptime checks, alerts | 50 monitors, 5-minute interval | Better Stack free |
| Bitwarden | Free (organization: 2 users) | Store break-glass secrets and recovery keys | — | 1Password (paid) |

### 4.2 Software components (all open source, $0)

| Component | Version policy | Role |
|---|---|---|
| Ubuntu Server | 24.04 LTS (ARM64) | Host OS, security support until 2029 |
| Docker Engine + Compose v2 | Latest stable | Runs all services |
| Node.js | 22 LTS | Runtime for `web` and `worker` |
| Next.js / React / TypeScript | Pinned in `pnpm-lock.yaml` | Application |
| PostgreSQL | 16.x (minor updates monthly) | Primary database |
| Redis | 7.x | Job queue, rate-limit counters, cache |
| BullMQ | Pinned | Background jobs: rating, imports, renewals, email |
| Prisma | 7.x pinned | Schema, migrations, data access |
| Auth.js | 5.x pinned | Authentication, MFA, sessions |
| WAL-G | Latest release | Continuous Postgres backup to R2 |
| ClamAV | Latest | Virus scanning of uploads |
| cloudflared | Latest | Tunnel connector |
| Grafana Alloy | Latest | Ships logs/metrics, scrubbing sensitive fields |
| unattended-upgrades, fail2ban, auditd, AIDE | Ubuntu packages | Host patching and intrusion detection |

---

## 5. Capacity, limits and free-tier constraints

### 5.1 Sizing

| Resource | Allocation | Expected use (1 agency, ≤25 staff) |
|---|---|---|
| CPU | 4 ARM cores | < 15% average; spikes during rating |
| Memory | 24 GB | Postgres 4 GB, web 1 GB, worker 1 GB, Redis 512 MB, ClamAV 1.5 GB, headroom ~15 GB |
| Disk | 200 GB (100 GB OS+Docker, 100 GB data volume) | Database < 5 GB for 50k clients |
| Files (R2) | 10 GB | ~20,000 typical PDFs; alert at 8 GB |
| Backups (R2) | Shares the 10 GB | 14-day retention, compressed; alert at 8 GB total |

### 5.2 Constraints and their mitigations

| Constraint | Impact | Mitigation |
|---|---|---|
| Oracle reclaims *idle* Always Free VMs on free-trial accounts | Server could be stopped | Upgrade account to Pay-As-You-Go (Always Free resources stay $0); budget alert at $1 |
| A1 capacity sometimes unavailable in a region | Provisioning may fail | Retry, or choose another availability domain; keep infrastructure-as-code to re-provision |
| Single VM | Outage during host failure | Off-site backups, restore runbook RB-04, RTO ≤ 4 h |
| R2 10 GB shared by documents and backups | Storage may fill | Usage alert at 80%; move backups to Backblaze B2 free 10 GB if needed |
| Resend 100 emails/day | Bulk renewal emails may hit cap | Queue throttles to 90/day; bulk campaigns deferred to Option B |
| Sentry 5k errors/month | Error flood could exhaust quota | Rate-limit identical errors; inbound filters |
| No SMS | No text reminders | Email-only in Option A |

---

## 6. Environments

| Environment | Where | Data | Access | Deploys |
|---|---|---|---|---|
| Development | Developer machine (Docker Compose) | Fake (seed script) | Developer | On save |
| Staging | Same VM, separate Compose project `ezly-staging`, separate database and R2 prefix | Fake only | Engineering via Cloudflare Access | Automatically on merge to `main` |
| Production | VM, Compose project `ezly-prod` | Real client data | Agency staff | Manual promotion of a tagged release |

Staging and production share the host but **never** share databases, Redis
instances, secrets, buckets or encryption keys. Staging runs with lower memory limits.

---

## 7. Provisioning procedure

Perform these steps in order. Record completion (date, person) in the go-live
checklist (§17). Estimated time: 4–6 hours.

### 7.1 Accounts

1. Create an **organization email** (e.g. `it@sahaagency.com`) used for all
   service accounts. Never use a personal email.
2. Create accounts: Oracle Cloud, Cloudflare, GitHub organization, Resend, Sentry,
   Grafana Cloud, UptimeRobot, Bitwarden organization, Google Cloud (Maps).
3. Enable **MFA (authenticator app or hardware key)** on every account. Store
   recovery codes in Bitwarden.
4. Oracle: upgrade the tenancy to **Pay-As-You-Go**, then create a budget of **$1**
   with an alert at 1% to the organization email.
5. Google Cloud: restrict the Maps API key to the production domain and to the
   Places + Geocoding APIs only; set a budget alert at $1.

### 7.2 Oracle Cloud network and VM

1. Create a compartment `ezly`.
2. Create a VCN with a **private** subnet for the VM plus a NAT gateway for outbound
   traffic (all free). No internet gateway route to the VM.
3. Security list: **no ingress rules**. (SSH goes through Cloudflare Access or the free
   OCI Bastion service.)
4. Create the instance: shape `VM.Standard.A1.Flex`, 4 OCPU, 24 GB, Ubuntu 24.04,
   SSH public key of the administrator only.
5. Attach a separate 100 GB block volume for `/srv/ezly-data` (database and Redis).
   Block volumes are encrypted at rest by Oracle by default; additionally select a
   **customer-managed key** from Oracle Vault.
6. Enable volume backup policy "Bronze" (weekly, within free 5-backup limit).

### 7.3 Host hardening (CIS Ubuntu Level 1 baseline)

```
# as the admin user
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades fail2ban auditd aide ufw
sudo dpkg-reconfigure -plow unattended-upgrades      # security updates daily, reboot window 03:30
sudo ufw default deny incoming && sudo ufw default allow outgoing && sudo ufw enable
```

- `/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`,
  `AllowUsers <admin>`, `KbdInteractiveAuthentication no`.
- Create one named sudo user per administrator; no shared accounts.
- Mount `/srv/ezly-data` with `nodev,nosuid`.
- Enable `auditd` rules for `/etc`, `/srv/ezly`, Docker socket and sudo use.
- Initialize AIDE (file integrity) and schedule a daily check that emails differences.
- Set timezone to UTC and enable `systemd-timesyncd`.

### 7.4 Docker

Install Docker Engine from Docker's official repository. Configure
`/etc/docker/daemon.json`:

```json
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true,
  "userland-proxy": false
}
```

Only administrators are in the `docker` group (it is equivalent to root).

### 7.5 Cloudflare

1. Add the domain (or use the existing `sahaagency.com` zone) to Cloudflare.
2. SSL/TLS mode **Full (strict)**; minimum TLS 1.2; HSTS enabled (max-age 1 year,
   include subdomains) after go-live verification.
3. Create a **Tunnel** `ezly-prod`; route `app.<domain>` → `http://web:3000` and
   `staging.<domain>` → `http://web-staging:3000`.
4. WAF: enable Cloudflare managed free ruleset; add rate-limiting rule:
   `/api/auth/*` 10 requests/minute per IP; block countries the agency never serves
   (optional).
5. **Access**: protect `staging.<domain>` and the SSH hostname with an Access policy
   requiring organization email + one-time PIN.
6. R2: create buckets `ezly-documents-prod`, `ezly-documents-staging`,
   `ezly-backups`. Create scoped API tokens (one per bucket, read/write only to it).
   Enable bucket lifecycle rule on `ezly-backups`: delete objects after 15 days.

### 7.6 Oracle Vault (key management)

1. Create a Vault (default, software-protected — free) in compartment `ezly`.
2. Create master encryption key `ezly-field-kek` (AES-256).
3. Create a dynamic group containing the VM and a policy allowing it to use only that
   key: `Allow dynamic-group ezly-vm to use keys in compartment ezly where target.key.id = '<kek-ocid>'`.
4. The application generates a data encryption key (DEK) once, wraps it with the KEK,
   and stores only the wrapped DEK in configuration (§10.4).

### 7.7 Application stack

```
sudo mkdir -p /srv/ezly/{prod,staging} /srv/ezly-data/{prod,staging}
sudo chown -R <admin>:docker /srv/ezly
# place docker-compose.prod.yml (Appendix A) and the env file (§8) in /srv/ezly/prod
sudo install -m 600 -o root -g root ezly.env /srv/ezly/prod/ezly.env
cd /srv/ezly/prod && docker compose up -d
docker compose run --rm web pnpm --filter @ezly/db exec prisma migrate deploy
```

Then create the first admin user with the one-time CLI command
`docker compose run --rm web pnpm ezly:create-admin --email <owner email>`;
the owner sets their password and MFA on first login.

### 7.8 Verification

| Check | Expected |
|---|---|
| `curl -I https://app.<domain>` | `200`, `strict-transport-security` header present |
| `nmap -Pn <VM public IP>` from outside | All ports filtered |
| Login without MFA after enrollment | Rejected |
| Staging URL without Access | Cloudflare Access login page |
| `docker compose ps` | All services `healthy` |
| Backup run (RB-06) | New base backup listed in R2 |

---

## 8. Configuration reference

All configuration is via environment variables in `/srv/ezly/<env>/ezly.env`
(mode `600`, owner `root`). A copy of production values is kept in Bitwarden
("Ezly production env"). Variables marked **secret** must never be logged, committed,
or pasted into tickets.

| Variable | Secret | Example / format | Purpose |
|---|---|---|---|
| `NODE_ENV` | | `production` | Runtime mode |
| `APP_URL` | | `https://app.sahaagency.com` | Absolute links, cookie domain |
| `DATABASE_URL` | yes | `postgresql://ezly_app:…@postgres:5432/ezly` | App role (no superuser, RLS enforced) |
| `DATABASE_MIGRATE_URL` | yes | `postgresql://ezly_migrator:…@postgres:5432/ezly` | Migration role, used only by deploy step |
| `REDIS_URL` | yes | `redis://:…@redis:6379/0` | Queue and rate limits; password required |
| `AUTH_SECRET` | yes | 32+ random bytes, base64 | Session signing |
| `AUTH_GOOGLE_ID` / `_SECRET` | yes | — | Optional Google sign-in |
| `AUTH_MICROSOFT_ID` / `_SECRET` | yes | — | Optional Microsoft sign-in |
| `FIELD_KEK_OCID` | | `ocid1.key.oc1…` | Oracle Vault master key ID |
| `FIELD_DEK_WRAPPED` | yes | base64 | Wrapped data key for SSN/DL encryption |
| `S3_ENDPOINT` | | `https://<acct>.r2.cloudflarestorage.com` | R2 endpoint |
| `S3_BUCKET` | | `ezly-documents-prod` | Documents bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | — | Bucket-scoped token |
| `WALG_S3_PREFIX` | | `s3://ezly-backups/prod` | Backup location |
| `WALG_LIBSODIUM_KEY` | yes | 32 random bytes, hex | Client-side backup encryption |
| `RESEND_API_KEY` | yes | — | Email sending |
| `EMAIL_FROM` | | `Saha Agency <no-reply@sahaagency.com>` | Sender (SPF/DKIM/DMARC configured) |
| `GOOGLE_MAPS_API_KEY` | yes | — | Address autocomplete (domain-restricted) |
| `SENTRY_DSN` | | — | Error reporting |
| `CLAMAV_HOST` | | `clamav:3310` | Upload scanning |
| `SESSION_IDLE_MINUTES` | | `30` | Idle timeout |
| `SESSION_MAX_HOURS` | | `12` | Absolute session lifetime |
| `RATING_ADAPTERS` | | `sim-summit,sim-harbor,…` | Enabled carrier adapters |

Rules: secrets are generated with `openssl rand -base64 32`; every secret has an
owner and a rotation date in Bitwarden; staging and production never share a secret.

---

## 9. Build, release and deployment (CI/CD)

### 9.1 Pipeline

| Stage | Trigger | Steps | Gate |
|---|---|---|---|
| Verify | Every push / pull request | Install (frozen lockfile), lint, typecheck, unit tests, build, Prisma migration check against a throwaway Postgres | All green |
| Security | Every pull request + weekly | Dependabot, `pnpm audit --prod`, GitHub secret scanning, CodeQL (free for public / via GitHub Advanced Security if private and eligible; otherwise Semgrep CE) | No high/critical findings |
| Package | Merge to `main` | Build ARM64 Docker image, tag with commit SHA, push to GitHub Container Registry (private) | Image builds |
| Deploy staging | After package | GitHub Actions connects through Cloudflare Access (service token) and runs `deploy.sh staging <sha>` | Smoke tests pass |
| Release | Manual (`git tag vX.Y.Z`) | Changelog generated; image re-tagged `vX.Y.Z` | Approval by maintainer |
| Deploy production | Manual workflow dispatch with version | Backup → migrate → rolling restart → smoke tests | Owner/maintainer approval in GitHub Environments |

### 9.2 Deployment script behaviour (`deploy.sh`)

1. Pull the image for the requested version.
2. Trigger an on-demand WAL-G backup (production only).
3. Run `prisma migrate deploy` with the migrator role.
4. Restart `worker`, then `web`, one at a time; wait for health checks (`/api/health`).
5. Run smoke tests (login page, authenticated API ping, queue round-trip).
6. On failure: automatically redeploy the previous image tag (RB-02).

Migrations are **expand-then-contract**: a release may add columns/tables; removing
or renaming happens in a later release once no running code uses them. This keeps
rollback safe.

### 9.3 Deployment windows

Production deploys: weekdays 19:00–22:00 local time, never during month-end renewal
runs. Emergency security fixes may deploy any time with owner notification.

---

## 10. Security controls

### 10.1 Data classification

| Class | Examples | Handling |
|---|---|---|
| **Restricted** | SSN, driver's license number, bank/EFT details, passwords, MFA secrets | Field-level encryption, masked display, access logged, never in logs/errors/AI prompts/exports by default |
| **Confidential** | Names, DOB, addresses, phone, email, policy and claims data, documents | Encrypted at rest and in transit, role-based access, audit logged |
| **Internal** | Carrier configuration, reports, settings | Authenticated staff only |
| **Public** | Marketing pages | None |

### 10.2 Identity and access management

- **Staff authentication:** Auth.js; passwords minimum 12 characters checked against
  a breached-password list; Argon2id hashing; **MFA mandatory** (TOTP or WebAuthn
  passkey) for every user; lockout with exponential back-off after 5 failures.
- **Sessions:** HTTP-only, `Secure`, `SameSite=Lax` cookies; 30-minute idle timeout,
  12-hour maximum; sessions revoked on password or role change.
- **Authorization:** roles `ADMIN`, `PRODUCER`, `CSR`, `READ_ONLY`; permission checks
  on every server action and API route (deny by default); optional "own accounts only"
  restriction for producers.
- **Tenant isolation:** every table has `agency_id`; PostgreSQL Row-Level Security
  policies enforce `agency_id = current_setting('app.agency_id')`; the application
  role is not the table owner and cannot bypass RLS. Automated tests attempt
  cross-agency reads/writes on every endpoint and must fail.
- **Administrative access:** named accounts, SSH keys + Cloudflare Access MFA; no
  shared passwords; access reviewed quarterly (§14); leavers removed the same day.
- **Service credentials:** one credential per service and environment, least
  privilege (e.g. R2 token limited to one bucket).

### 10.3 Network security

- No inbound ports on the VM; all traffic via Cloudflare Tunnel.
- Database, Redis and ClamAV are reachable only on the internal Docker network.
- Outbound traffic restricted (host firewall egress allow-list) to: Cloudflare,
  Oracle APIs, GitHub, Ubuntu/Docker mirrors, carrier endpoints, Resend, Sentry,
  Grafana, Google Maps.
- TLS 1.2+ end to end; HSTS; security headers (CSP with nonces, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`).

### 10.4 Encryption and key management

| Data | At rest | In transit |
|---|---|---|
| Database and Redis volumes | Oracle block volume encryption with customer-managed Vault key | Internal network only |
| SSN, DL #, bank details | **Additionally** AES-256-GCM per field, unique nonce, using the DEK | TLS |
| Documents | R2 server-side encryption (AES-256) | TLS |
| Backups | WAL-G libsodium client-side encryption **before** upload, plus R2 encryption | TLS |

**Envelope encryption:** the DEK is held only in memory after being unwrapped at
start-up by Oracle Vault using the VM's instance identity. Disk, backups and
environment files contain only the wrapped DEK. **Key rotation:** KEK yearly (Vault
versioning); DEK every 2 years or on suspicion of compromise via the re-encryption
job (RB-07). Display masking: `***-**-1234`; "reveal" requires `ADMIN` or explicit
permission, a reason, and writes an audit entry.

### 10.5 Application security

- Baseline: **OWASP ASVS 4.0 Level 2**; OWASP Top 10 reviewed each release.
- All input validated server-side with Zod schemas; database access only through
  Prisma (parameterized); no raw SQL from user input.
- React output encoding; Content Security Policy blocks inline scripts.
- CSRF protection on all state-changing requests (Next.js server actions origin
  checks + same-site cookies).
- Rate limits (Redis): login 5/min/user, API 300/min/user, exports 5/hour/user.
- File uploads: allow-list of types (PDF, JPG, PNG, HEIC, DOCX, XLSX), 25 MB limit,
  ClamAV scan before the file becomes visible, stored under random keys, downloaded
  only via 5-minute signed URLs.
- Exports of client lists require `ADMIN` and are logged.
- AI features (later): Restricted fields are stripped before any prompt is built.

### 10.6 Logging and audit

- **Audit log (database):** every create/update/delete, every login (success and
  failure), every reveal of Restricted data, every export and permission change:
  actor, agency, entity, action, before/after diff (Restricted values redacted),
  IP, user agent, timestamp. Append-only for the application role. Retained **7 years**.
- **Application logs:** JSON, shipped to Grafana Cloud with Alloy; a scrubbing stage
  removes SSN/DL patterns, emails and phone numbers. Retained 14 days (free tier); a
  weekly compressed export is kept in R2 for 90 days.
- **Host logs:** auditd, sshd, sudo, fail2ban → Grafana Cloud.
- Clocks synchronized (UTC) on all components.

### 10.7 Vulnerability and patch management

| Item | Frequency | SLA to remediate |
|---|---|---|
| OS security patches | Daily automatic (unattended-upgrades) | Critical: 48 h (reboot window) |
| Container base images | Weekly rebuild | Critical CVE: 72 h |
| npm dependencies | Dependabot daily | Critical: 7 days, High: 30 days |
| PostgreSQL / Redis minor versions | Monthly | Within maintenance window |
| External scan (OWASP ZAP baseline vs staging) | Monthly + before each release | High: before release |
| Independent penetration test | Before first real-data go-live, then yearly (cost: optional; free alternative is a documented internal test against the ASVS checklist) | Per finding severity |

### 10.8 Secrets management

- Secrets live only in `/srv/ezly/<env>/ezly.env` (root, mode 600), GitHub
  Environment secrets (for deploy tokens), and Bitwarden.
- GitHub secret scanning and push protection enabled; pre-commit hook blocks `.env`.
- Rotation: yearly, on staff departure, or immediately after suspected exposure.

### 10.9 Secure development

- Branch protection on `main`: pull request, 1 approval, passing CI, no force push.
- Code review checklist includes authorization checks, tenant scoping, input
  validation and logging of Restricted data.
- Production data never copied to development or staging. Support debugging uses
  audit logs and fake reproductions.

---

## 11. Backup and disaster recovery

### 11.1 Objectives

| Metric | Target |
|---|---|
| RPO (maximum data loss) | ≤ 5 minutes |
| RTO (time to restore service) | ≤ 4 hours |
| Backup retention | 14 days point-in-time + 4 weekly volume snapshots + monthly logical dump kept 12 months (encrypted, in R2 within quota or offline encrypted drive) |

### 11.2 What is backed up

| Asset | Method | Frequency | Location |
|---|---|---|---|
| PostgreSQL | WAL-G base backup + continuous WAL archiving (`archive_timeout = 60s`) | Base nightly 02:00, WAL continuous | R2 `ezly-backups/prod` (encrypted) |
| PostgreSQL (logical) | `pg_dump -Fc`, encrypted with `age` | Monthly | R2 + offline encrypted drive held by owner |
| Data volume | Oracle volume backup | Weekly | Oracle (different from VM) |
| Documents | Already off-server in R2; object versioning enabled | Continuous | R2 |
| Redis | AOF persistence; contents are re-creatable jobs | Continuous | Data volume |
| Configuration | `ezly.env` copy in Bitwarden; Compose files in git | On change | Bitwarden, GitHub |

### 11.3 Restore testing

- **Monthly:** restore the latest backup to a scratch container on the VM, run
  integrity queries (row counts, latest audit timestamp), record result.
- **Quarterly:** full DR drill — build a fresh VM from §7, restore to a chosen point in
  time, log in, verify a known client record; record actual RTO/RPO.
- A failed test is treated as a Severity 2 incident.

### 11.4 Disaster scenarios

| Scenario | Response |
|---|---|
| Container crash | Docker restarts automatically; alert if restarts > 3/hour |
| VM failure or deletion | RB-04: provision new VM (§7), restore from WAL-G, repoint tunnel |
| Accidental data deletion | RB-05: point-in-time restore to a side database, copy back affected rows |
| Oracle account suspended | Provision on Hetzner/any Docker host using the same Compose files, restore from R2 |
| Ransomware / host compromise | IR-01; rebuild from scratch, restore from backups predating compromise, rotate all secrets |
| Cloudflare outage | Wait; no alternate ingress (documented accepted risk) |

---

## 12. Monitoring, logging and alerting

| Signal | Source | Threshold | Alert to |
|---|---|---|---|
| Site down | UptimeRobot `GET /api/health` every 5 min | 2 consecutive failures | Email + mobile push |
| Error spike | Sentry | > 20 errors in 10 min, or any new error type in auth | Email |
| CPU / memory / disk | Alloy → Grafana | Disk > 80%, memory > 90% for 10 min | Email |
| Backup freshness | Cron check of last WAL-G base backup | > 26 hours old | Email |
| WAL archive lag | Postgres metric | > 10 minutes | Email |
| Failed logins | Audit log query | > 20/hour agency-wide or > 5 for one user | Email to admin |
| R2 usage | Daily script | > 8 GB | Email |
| Certificate / tunnel | Cloudflare notifications | Tunnel down | Email |
| Queue health | BullMQ metrics | Failed jobs > 10/hour, waiting > 500 | Email |

On-call: the maintainer is primary; the agency owner is notified for Severity 1 and 2.

---

## 13. Operational runbooks

Each runbook ends with: record what was done in the operations log (date, person,
ticket/PR link).

**RB-01 Deploy a release** — GitHub → Actions → "Deploy production" → enter version →
approve. Watch smoke tests; confirm `/api/health` and one login.

**RB-02 Roll back** — Run "Deploy production" with the previous version. If the bad
release ran a migration, the previous version remains compatible (expand-then-contract);
never run down-migrations in production.

**RB-03 Restart a service** — `cd /srv/ezly/prod && docker compose restart <service>`;
check `docker compose ps` and logs.

**RB-04 Full server rebuild** — §7.2–7.7 on a new VM → stop `web`/`worker` →
`wal-g backup-fetch LATEST` (or target time with `recovery_target_time`) → start
Postgres in recovery → verify → start app → update tunnel → verify (§7.8).

**RB-05 Point-in-time recovery of deleted data** — restore into a separate container
at a time just before the deletion; export affected rows; import into production
inside a transaction; record in audit log with reason.

**RB-06 On-demand backup** — `docker compose exec walg wal-g backup-push /var/lib/postgresql/data`; confirm with `wal-g backup-list`.

**RB-07 Rotate keys and secrets** — Vault: create new KEK version, re-wrap DEK, update
`FIELD_DEK_WRAPPED`, redeploy. DEK rotation: run `pnpm ezly:reencrypt` job (re-encrypts
in batches, idempotent). Other secrets: generate new, update env + Bitwarden, redeploy,
revoke old.

**RB-08 Disk nearly full** — `docker system prune` (images only, never volumes); check
Postgres bloat (`VACUUM`), log sizes; if data volume > 80%, expand the block volume
(within 200 GB free total).

**RB-09 Offboard a staff member** — disable user in Ezly (sessions revoked instantly);
remove from Cloudflare Access, GitHub, Bitwarden; rotate any secret they could read.

**RB-10 Restore a deleted document** — R2 object versioning: restore previous version.

**IR-01 Security incident response** (aligned with NIST SP 800-61):
1. **Detect & triage** — classify severity (S1 data breach suspected / S2 service down
   or control failure / S3 degraded / S4 minor).
2. **Contain** — revoke sessions, rotate credentials, block IPs in Cloudflare, take VM
   snapshot for evidence before changes.
3. **Investigate** — audit log, host logs, Cloudflare logs; determine data affected.
4. **Eradicate & recover** — rebuild from known-good images and backups.
5. **Notify** — the agency owner immediately; legal counsel; regulators and affected
   consumers within statutory deadlines (§15); carriers if their data is affected.
6. **Review** — written post-incident report within 10 business days; update controls
   and this document.

---

## 14. Maintenance schedule

| Frequency | Task | Owner |
|---|---|---|
| Daily (automatic) | OS security updates, backups, AIDE check, alert review | System / maintainer |
| Weekly | Review Sentry and failed jobs; rebuild images with patched bases; check R2 usage | Maintainer |
| Monthly | Restore test; Postgres/Redis minor updates; ZAP scan of staging; review Dependabot backlog; confirm Oracle account healthy and $0 billed | Maintainer |
| Quarterly | DR drill; access review (users, roles, admin accounts, API tokens); review firewall egress list | Maintainer + owner |
| Yearly | Rotate KEK and long-lived secrets; risk assessment; security awareness refresher for staff; review this document; penetration test or documented internal test | Owner + maintainer |

---

## 15. Regulatory compliance mapping

Ezly stores nonpublic personal information (NPI) of insurance consumers in Maryland
and Virginia. Applicable frameworks:

- **GLBA Safeguards Rule** (16 CFR Part 314, as amended 2021/2023).
- **Maryland Insurance Data Security law** (Md. Code, Insurance Title 33, based on the
  NAIC Insurance Data Security Model Law #668).
- **Virginia Insurance Data Security Act** (Va. Code § 38.2-621 et seq., NAIC #668).
- State data-breach notification laws (Md. Commercial Law § 14-3504; Va. Code § 18.2-186.6).

*This mapping is technical guidance, not legal advice. Exemptions (e.g. by employee
count) and notification deadlines must be confirmed with counsel.*

| Requirement | Ezly control (this document) |
|---|---|
| Written information security program; designated qualified individual | Owner designates a responsible person; this document + IR-01 form the technical part of the program |
| Risk assessment | §16 risk register, reviewed yearly |
| Access controls / least privilege | §10.2 |
| Encryption of NPI in transit and at rest | §10.3, §10.4 |
| Multi-factor authentication | §10.2 (mandatory for all users and admins) |
| Secure development practices | §9, §10.5, §10.9 |
| Data retention and disposal | Audit 7 years; client records per agency retention policy; secure deletion job; backups expire at 15 days / 12 months |
| Change management | §9 |
| Monitoring and logging of user activity | §10.6, §12 |
| Vulnerability management / penetration testing | §10.7 |
| Service-provider oversight | §4.1 inventory; review providers' security terms yearly |
| Incident response plan | IR-01 |
| Notification of cybersecurity events to regulators | IR-01 step 5 (commonly within 72 hours under Model Law #668 states — confirm) |
| Annual certification / report to board or owner | Yearly review (§14) produces a written report |

---

## 16. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Single VM hardware/host failure | Medium | High | Off-site PITR backups, rebuild runbook, quarterly drills | Medium |
| R2 | Oracle changes or ends Always Free / reclaims VM | Low–Med | High | PAYG upgrade; portable Compose stack; backups outside Oracle (R2) | Low |
| R3 | Maintainer unavailable (bus factor) | Medium | High | This documentation; Bitwarden break-glass; Option B migration path | Medium |
| R4 | Credential theft / phishing of staff | Medium | High | Mandatory MFA, session limits, anomaly alerts | Low |
| R5 | Unpatched vulnerability | Medium | High | Automatic patching, Dependabot, scans, SLAs | Low |
| R6 | Free-tier quota exhausted (R2, email, Sentry) | Medium | Medium | Usage alerts at 80%; documented alternatives | Low |
| R7 | Backup corruption undetected | Low | High | Monthly restore tests | Low |
| R8 | Cross-agency data leak (multi-tenant bug) | Low | High | RLS + automated isolation tests | Low |
| R9 | Cloudflare outage | Low | Medium | Accepted; no alternate ingress | Low |
| R10 | Insider misuse | Low | High | Least privilege, audit log, reveal logging, quarterly review | Low |

---

## 17. Go-live checklist (real client data)

Sign and date each item. Real client data may be loaded only when every item is complete.

- [ ] All service accounts on organization email with MFA; recovery codes in Bitwarden
- [ ] Oracle PAYG upgrade done; $1 budget alerts active (Oracle, Google)
- [ ] VM has no inbound ports (external scan attached)
- [ ] Host hardening (§7.3) complete; CIS benchmark scan ≥ 90% (e.g. `lynis`)
- [ ] Vault KEK created; DEK wrapped; no plaintext keys on disk (verified)
- [ ] RLS enabled on all tenant tables; isolation test suite passing
- [ ] MFA enforced for every user; password policy verified
- [ ] Security headers grade A (securityheaders.com) and TLS grade A (SSL Labs)
- [ ] OWASP ZAP baseline: no high findings
- [ ] Backups running; restore test completed and recorded with measured RTO/RPO
- [ ] Monitoring and alerts verified by triggering each one
- [ ] Email SPF, DKIM, DMARC configured and passing
- [ ] Incident response contacts filled in (owner, maintainer, counsel, insurer of the agency's cyber policy)
- [ ] Staff trained: phishing, MFA, handling Restricted data
- [ ] Owner sign-off

---

## 18. Upgrade path to Option B

Triggers: more than one agency; > 25 staff; > 8 GB documents; attestation requests;
maintainer capacity. The application needs no code changes — only configuration.
Follow Option B §14 (migration procedure). Expected downtime: ≤ 30 minutes.

---

## 19. Appendices

### Appendix A — `docker-compose.prod.yml` (reference)

```yaml
name: ezly-prod
x-app: &app
  image: ghcr.io/<org>/ezly:${EZLY_VERSION}
  env_file: ./ezly.env
  restart: unless-stopped
  read_only: true
  tmpfs: [/tmp]
  security_opt: ["no-new-privileges:true"]
  cap_drop: [ALL]
  networks: [ezly]

services:
  web:
    <<: *app
    command: ["node", "apps/web/server.js"]
    healthcheck: { test: ["CMD", "node", "healthcheck.js"], interval: 30s, retries: 3 }
    deploy: { resources: { limits: { memory: 1g } } }
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy } }
  worker:
    <<: *app
    command: ["node", "workers/dist/index.js"]
    deploy: { resources: { limits: { memory: 1g } } }
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ezly
      POSTGRES_USER: ezly_owner
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_owner_password
    command: >
      postgres -c ssl=off -c archive_mode=on -c archive_timeout=60
      -c "archive_command=wal-g wal-push %p" -c shared_buffers=1GB
      -c password_encryption=scram-sha-256 -c log_connections=on
    volumes: ["/srv/ezly-data/prod/postgres:/var/lib/postgresql/data"]
    secrets: [pg_owner_password]
    healthcheck: { test: ["CMD", "pg_isready", "-U", "ezly_owner"], interval: 10s }
    networks: [ezly]
  redis:
    image: redis:7
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes: ["/srv/ezly-data/prod/redis:/data"]
    healthcheck: { test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"], interval: 10s }
    networks: [ezly]
  clamav:
    image: clamav/clamav:stable
    restart: unless-stopped
    networks: [ezly]
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: ["tunnel", "--no-autoupdate", "run"]
    environment: { TUNNEL_TOKEN: "${CF_TUNNEL_TOKEN}" }
    networks: [ezly]

networks:
  ezly: { driver: bridge, internal: false }
secrets:
  pg_owner_password: { file: ./secrets/pg_owner_password }
```

(The WAL-G binary is included in a small derived Postgres image; final files are
produced in Phase 7 of the implementation plan.)

### Appendix B — Database roles

| Role | Rights | Used by |
|---|---|---|
| `ezly_owner` | Owns schema; superuser not granted to apps | Break-glass only |
| `ezly_migrator` | DDL on schema `public` | Deploy step |
| `ezly_app` | SELECT/INSERT/UPDATE/DELETE, subject to RLS; INSERT-only on `AuditLog` | web, worker |
| `ezly_readonly` | SELECT, subject to RLS | Reporting (future) |

### Appendix C — Contacts (fill in before go-live)

| Role | Name | Phone | Email |
|---|---|---|---|
| System owner (Saha Agency) | | | |
| Maintainer (primary) | | | |
| Maintainer (backup) | | | |
| Legal counsel | | | |
| Cyber insurance carrier / breach hotline | | | |
