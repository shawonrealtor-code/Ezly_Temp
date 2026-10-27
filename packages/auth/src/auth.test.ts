import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FieldCipher, createStore, type Store } from "@ezly/store";
import {
  AuthService,
  RateLimiter,
  can,
  checkPasswordPolicy,
  currentTotp,
  hashPassword,
  verifyTotp,
  type CurrentSession,
} from "./index.ts";

const PASSWORD = "Correct-horse-battery-9";
const meta = { ip: "203.0.113.7", userAgent: "vitest" };

let dataDir: string;
let store: Store;
let clock: number;
let auth: AuthService;
let agencyId: string;
let adminId: string;

const advance = (ms: number) => (clock += ms);
const MIN = 60_000;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "ezly-auth-"));
  store = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
  clock = Date.parse("2026-10-27T15:00:00Z");
  auth = new AuthService(store, {}, () => new Date(clock));
  agencyId = (await store.agencies.create({ name: "Agency" }, { actorId: null })).id;
  const passwordHash = await hashPassword(PASSWORD);
  adminId = (await store.forAgency(agencyId).users.create({ email: "admin@example.com", name: "Ada Admin", role: "ADMIN", passwordHash })).id;
  await store.forAgency(agencyId).users.create({ email: "csr@example.com", name: "Cy Service", role: "CSR", passwordHash });
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

/** Signs in and enrolls MFA; returns the full session token and the authenticator secret. */
async function enrollAndSignIn(email = "csr@example.com") {
  const first = await auth.signIn(email, PASSWORD, meta);
  if (!first.ok) throw new Error("sign-in failed");
  const pending = (await auth.getSession(first.token))!;
  const { secret } = await auth.startMfaEnrollment(pending);
  const done = await auth.confirmMfaEnrollment(first.token, currentTotp(secret, clock), meta);
  if (!done.ok) throw new Error("enrollment failed");
  return { token: done.token, secret, recoveryCodes: done.recoveryCodes! };
}

describe("authenticator codes (RFC 6238)", () => {
  // RFC 6238 test secret "12345678901234567890"; at T=59s the 8-digit SHA-1 code is 94287082.
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the RFC test vector", () => {
    expect(verifyTotp(rfcSecret, "287082", undefined, 59_000)).toBe(1);
  });

  it("rejects replayed, wrong and malformed codes", () => {
    expect(verifyTotp(rfcSecret, "287082", 1, 59_000)).toBeNull();
    expect(verifyTotp(rfcSecret, "000000", undefined, 59_000)).toBeNull();
    expect(verifyTotp(rfcSecret, "28708", undefined, 59_000)).toBeNull();
  });

  it("allows one step of clock drift but not more", () => {
    expect(verifyTotp(rfcSecret, "287082", undefined, 59_000 + 30_000)).toBe(1);
    expect(verifyTotp(rfcSecret, "287082", undefined, 59_000 + 90_000)).toBeNull();
  });
});

describe("password policy", () => {
  it("rejects short, common or personal passwords and accepts strong ones", () => {
    expect(checkPasswordPolicy("short")).toHaveLength(1);
    expect(checkPasswordPolicy("password1234")).toContain("This password is too common.");
    expect(checkPasswordPolicy("jordan-is-great-2026", { email: "jordan@x.com" })).toContain("Don't include your email address.");
    expect(checkPasswordPolicy("mitchell-rules-2026", { name: "Jordan Mitchell" })).toContain("Don't include your name.");
    expect(checkPasswordPolicy(PASSWORD)).toEqual([]);
  });
});

describe("sign-in", () => {
  it("requires MFA enrollment on first sign-in, then a code on later sign-ins", async () => {
    const first = await auth.signIn("CSR@example.com", PASSWORD, meta);
    expect(first).toMatchObject({ ok: true, next: "mfa_setup" });
    const pending = (await auth.getSession(first.ok ? first.token : ""))!;
    expect(pending.session.mfaVerified).toBe(false);

    const { secret, recoveryCodes } = await (async () => {
      const { secret } = await auth.startMfaEnrollment(pending);
      const done = await auth.confirmMfaEnrollment(first.ok ? first.token : "", currentTotp(secret, clock), meta);
      expect(done).toMatchObject({ ok: true });
      return { secret, recoveryCodes: done.ok ? done.recoveryCodes! : [] };
    })();
    expect(recoveryCodes).toHaveLength(10);
    expect(await auth.getSession(first.ok ? first.token : "")).toBeNull(); // pending session replaced

    advance(MIN);
    const second = await auth.signIn("csr@example.com", PASSWORD, meta);
    expect(second).toMatchObject({ ok: true, next: "mfa" });
    const verified = await auth.verifyMfa(second.ok ? second.token : "", currentTotp(secret, clock), meta);
    expect(verified.ok).toBe(true);
    expect((await auth.getSession(verified.ok ? verified.token : ""))?.session.mfaVerified).toBe(true);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    expect(await auth.signIn("nobody@example.com", PASSWORD, meta)).toEqual({ ok: false, reason: "invalid" });
    expect(await auth.signIn("csr@example.com", "Wrong-password-123", meta)).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks the account after 5 wrong passwords, then unlocks after the lock period", async () => {
    for (let i = 0; i < 4; i++) expect((await auth.signIn("csr@example.com", "Wrong-password-123", meta)).ok).toBe(false);
    expect(await auth.signIn("csr@example.com", "Wrong-password-123", meta)).toEqual({ ok: false, reason: "locked" });
    expect(await auth.signIn("csr@example.com", PASSWORD, meta)).toEqual({ ok: false, reason: "locked" });
    advance(16 * MIN);
    expect((await auth.signIn("csr@example.com", PASSWORD, meta)).ok).toBe(true);
    expect((await store.usersByEmail("csr@example.com"))?.failedLoginCount).toBe(0);
  });

  it("rejects disabled users", async () => {
    const csr = (await store.usersByEmail("csr@example.com"))!;
    await auth.setActive(agencyId, adminId, csr.id, false);
    expect(await auth.signIn("csr@example.com", PASSWORD, meta)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ends the attempt after 5 wrong MFA codes", async () => {
    const { secret } = await enrollAndSignIn();
    advance(MIN);
    const second = await auth.signIn("csr@example.com", PASSWORD, meta);
    const token = second.ok ? second.token : "";
    for (let i = 0; i < 4; i++) expect(await auth.verifyMfa(token, "000000", meta)).toEqual({ ok: false, reason: "invalid" });
    expect(await auth.verifyMfa(token, "000000", meta)).toEqual({ ok: false, reason: "too_many" });
    expect(await auth.verifyMfa(token, currentTotp(secret, clock), meta)).toEqual({ ok: false, reason: "expired" });
  });

  it("does not accept the same code twice", async () => {
    const { secret } = await enrollAndSignIn();
    const second = await auth.signIn("csr@example.com", PASSWORD, meta);
    expect(await auth.verifyMfa(second.ok ? second.token : "", currentTotp(secret, clock), meta)).toMatchObject({ ok: false });
  });

  it("accepts each recovery code once", async () => {
    const { recoveryCodes } = await enrollAndSignIn();
    const attempt = async () => {
      const s = await auth.signIn("csr@example.com", PASSWORD, meta);
      return auth.useRecoveryCode(s.ok ? s.token : "", recoveryCodes[0].toUpperCase(), meta);
    };
    expect((await attempt()).ok).toBe(true);
    expect((await attempt()).ok).toBe(false);
    expect((await store.usersByEmail("csr@example.com"))?.recoveryCodeHashes).toHaveLength(9);
  });

  it("never stores the session token or plain MFA secret", async () => {
    const { token, secret } = await enrollAndSignIn();
    const files = await Promise.all(["sessions", "users"].map((f) => readFile(join(dataDir, "collections", `${f}.json`), "utf8")));
    expect(files.join()).not.toContain(token);
    expect(files.join()).not.toContain(secret);
  });
});

describe("sessions", () => {
  let session: { token: string };
  beforeEach(async () => (session = await enrollAndSignIn()));

  it("expires after 30 minutes of inactivity", async () => {
    advance(29 * MIN);
    expect(await auth.getSession(session.token)).not.toBeNull();
    advance(31 * MIN);
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("expires after 12 hours even when active", async () => {
    for (let i = 0; i < 12 * 6; i++) {
      advance(10 * MIN);
      if (i < 12 * 6 - 1) expect(await auth.getSession(session.token)).not.toBeNull();
    }
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("ends on sign-out", async () => {
    await auth.signOut(session.token, meta);
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("signs the user out everywhere when the password changes", async () => {
    const current = (await auth.getSession(session.token)) as CurrentSession;
    const other = await enrollAndSignInAgain();
    const result = await auth.changePassword(current, PASSWORD, "Another-strong-pass-42", meta);
    expect(result.ok).toBe(true);
    expect(await auth.getSession(session.token)).toBeNull();
    expect(await auth.getSession(other)).toBeNull();
    expect(await auth.getSession(result.ok ? result.token : "")).not.toBeNull();
    expect((await auth.signIn("csr@example.com", PASSWORD, meta)).ok).toBe(false);
  });

  it("signs the user out when an admin resets MFA, deactivates them or changes their role", async () => {
    const csr = (await store.usersByEmail("csr@example.com"))!;
    await auth.setRole(agencyId, adminId, csr.id, "PRODUCER");
    expect(await auth.getSession(session.token)).toBeNull();
    const again = await enrollAndSignInAgain();
    await auth.resetMfa(agencyId, adminId, csr.id, meta);
    expect(await auth.getSession(again)).toBeNull();
    expect((await auth.signIn("csr@example.com", PASSWORD, meta)) as object).toMatchObject({ next: "mfa_setup" });
  });

  it("stops admins from disabling or demoting themselves", async () => {
    await expect(auth.setActive(agencyId, adminId, adminId, false)).rejects.toThrow(/own account/);
    await expect(auth.setRole(agencyId, adminId, adminId, "CSR")).rejects.toThrow(/own account/);
  });

  /** Signs in again with the already-enrolled CSR, one step later so the code is fresh. */
  async function enrollAndSignInAgain(): Promise<string> {
    advance(MIN);
    const user = (await store.usersByEmail("csr@example.com"))!;
    const s = await auth.signIn("csr@example.com", PASSWORD, meta);
    if (!s.ok) throw new Error("sign-in failed");
    if (s.next === "mfa_setup") throw new Error("expected MFA");
    const secret = store.cipher.decrypt(user.mfaSecret!);
    const r = await auth.verifyMfa(s.token, currentTotp(secret, clock), meta);
    if (!r.ok) throw new Error(`mfa failed: ${r.reason}`);
    return r.token;
  }
});

describe("audit trail", () => {
  it("records sign-in events with IP but never passwords or codes", async () => {
    await auth.signIn("nobody@example.com", PASSWORD, meta);
    await enrollAndSignIn();
    const trail = await store.forAgency(agencyId).auditTrail();
    const actions = trail.map((e) => e.action);
    expect(actions).toContain("mfa.enrolled");
    expect(actions).toContain("login.success");
    expect(trail.find((e) => e.action === "login.success")?.ip).toBe(meta.ip);
    const raw = (await readFile(join(dataDir, "audit", "audit-2026-10.jsonl"), "utf8"));
    expect(raw).toContain('"detail":"unknown email"');
    expect(raw).not.toContain(PASSWORD);
  });
});

describe("permissions and rate limits", () => {
  it("gives each role only what it needs", () => {
    expect(can("READ_ONLY", "accounts:read")).toBe(true);
    expect(can("READ_ONLY", "quotes:run")).toBe(false);
    expect(can("CSR", "quotes:run")).toBe(true);
    expect(can("PRODUCER", "users:manage")).toBe(false);
    expect(can("ADMIN", "users:manage")).toBe(true);
  });

  it("limits attempts per key within the window", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect([1, 2, 3].map(() => limiter.hit("ip", 0).allowed)).toEqual([true, true, true]);
    expect(limiter.hit("ip", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 59 });
    expect(limiter.hit("other", 1_000).allowed).toBe(true);
    expect(limiter.hit("ip", 60_001).allowed).toBe(true);
  });
});
