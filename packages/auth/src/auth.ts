import { createHash, randomBytes } from "node:crypto";
import type { Session, Store, User } from "@ezly/store";
import { checkPasswordPolicy, hashPassword, verifyAgainstDummy, verifyPassword } from "./password.ts";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery.ts";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp.ts";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthPolicy {
  /** Signed-in sessions end after this much inactivity. */
  idleMinutes: number;
  /** Signed-in sessions end after this long regardless of activity. */
  maxHours: number;
  /** Time allowed between entering the password and the MFA code. */
  pendingMinutes: number;
  /** Consecutive wrong passwords before the account locks. */
  maxFailedLogins: number;
  /** First lock duration; doubles with each further failure, up to 24 hours. */
  lockMinutes: number;
  /** Wrong MFA codes allowed per sign-in attempt. */
  maxMfaAttempts: number;
}

export const DEFAULT_POLICY: AuthPolicy = {
  idleMinutes: 30,
  maxHours: 12,
  pendingMinutes: 10,
  maxFailedLogins: 5,
  lockMinutes: 15,
  maxMfaAttempts: 5,
};

export type SignInResult = { ok: true; token: string; next: "mfa" | "mfa_setup" } | { ok: false; reason: "invalid" | "locked" };
export type MfaResult =
  | { ok: true; token: string; mustChangePassword: boolean; recoveryCodes?: string[] }
  | { ok: false; reason: "invalid" | "expired" | "too_many" };
export type PasswordResult = { ok: true; token: string } | { ok: false; problems: string[] };

export interface CurrentSession {
  session: Session;
  user: User;
}

const SILENT = { actorId: null, silent: true } as const;
const TOUCH_INTERVAL_MS = 60_000;
const MAX_LOCK_MS = 24 * 60 * 60_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Sign-in, MFA, sessions and account security. Sessions are stored server-side; the browser only holds a
 * random token whose hash identifies the session, so sessions can be revoked instantly.
 */
export class AuthService {
  private readonly policy: AuthPolicy;

  constructor(
    private readonly store: Store,
    policy: Partial<AuthPolicy> = {},
    private readonly now: () => Date = () => new Date(),
  ) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  private get users() {
    return this.store.internal.users;
  }

  private get sessions() {
    return this.store.internal.sessions;
  }

  async signIn(email: string, password: string, meta: RequestMeta): Promise<SignInResult> {
    const user = await this.store.usersByEmail(email);
    if (!user || !user.passwordHash || !user.active) {
      if (user?.passwordHash) await verifyPassword(user.passwordHash, password);
      else await verifyAgainstDummy(password);
      await this.event("login.failure", user, meta, user ? (user.active ? "no password set" : "account disabled") : "unknown email");
      return { ok: false, reason: "invalid" };
    }

    const now = this.now();
    if (user.lockedUntil && new Date(user.lockedUntil) > now) {
      await this.event("login.locked", user, meta, `locked until ${user.lockedUntil}`);
      return { ok: false, reason: "locked" };
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      const overBy = failed - this.policy.maxFailedLogins;
      const lockedUntil =
        overBy >= 0
          ? new Date(now.getTime() + Math.min(this.policy.lockMinutes * 60_000 * 2 ** overBy, MAX_LOCK_MS)).toISOString()
          : undefined;
      await this.users.update(user.id, { failedLoginCount: failed, lockedUntil }, SILENT);
      await this.event("login.failure", user, meta, lockedUntil ? `wrong password; locked until ${lockedUntil}` : "wrong password");
      return { ok: false, reason: lockedUntil ? "locked" : "invalid" };
    }

    const fresh = await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: undefined }, SILENT);
    const token = await this.createSession(fresh, false, meta);
    return { ok: true, token, next: fresh.mfaConfirmedAt ? "mfa" : "mfa_setup" };
  }

  /** Returns the valid session for a cookie token, or null (and deletes it) if expired or revoked. */
  async getSession(token: string | undefined): Promise<CurrentSession | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const [session] = await this.sessions.list((s) => s.tokenHash === tokenHash);
    if (!session) return null;

    const now = this.now().getTime();
    const idleExpired = session.mfaVerified && new Date(session.lastSeenAt).getTime() + this.policy.idleMinutes * 60_000 <= now;
    const user = new Date(session.expiresAt).getTime() <= now || idleExpired ? null : await this.users.get(session.userId);
    if (!user || !user.active || user.sessionVersion !== session.sessionVersion) {
      await this.sessions.delete(session.id, SILENT).catch(() => undefined);
      return null;
    }
    if (session.mfaVerified && now - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
      return { session: await this.sessions.update(session.id, { lastSeenAt: new Date(now).toISOString() }, SILENT), user };
    }
    return { session, user };
  }

  /** Creates (or reuses) the user's pending authenticator secret for the enrollment QR code. */
  async startMfaEnrollment(current: CurrentSession): Promise<{ secret: string; uri: string }> {
    if (current.user.mfaConfirmedAt) throw new Error("MFA is already set up for this user");
    let secret: string;
    if (current.user.mfaSecret) {
      secret = this.store.cipher.decrypt(current.user.mfaSecret);
    } else {
      secret = generateTotpSecret();
      await this.users.update(current.user.id, { mfaSecret: this.store.cipher.encrypt(secret) }, SILENT);
    }
    return { secret, uri: totpUri(secret, current.user.email) };
  }

  async confirmMfaEnrollment(token: string, code: string, meta: RequestMeta): Promise<MfaResult> {
    const current = await this.getSession(token);
    if (!current || current.session.mfaVerified || current.user.mfaConfirmedAt || !current.user.mfaSecret) {
      return { ok: false, reason: "expired" };
    }
    const step = verifyTotp(this.store.cipher.decrypt(current.user.mfaSecret), code, current.user.lastTotpStep, this.now().getTime());
    if (step === null) return this.failMfa(current, meta);

    const recoveryCodes = generateRecoveryCodes();
    const user = await this.users.update(
      current.user.id,
      { mfaConfirmedAt: this.now().toISOString(), lastTotpStep: step, recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode) },
      SILENT,
    );
    await this.event("mfa.enrolled", user, meta);
    return this.completeSignIn({ ...current, user }, meta, recoveryCodes);
  }

  async verifyMfa(token: string, code: string, meta: RequestMeta): Promise<MfaResult> {
    const current = await this.pendingWithMfa(token);
    if (!current) return { ok: false, reason: "expired" };
    const step = verifyTotp(this.store.cipher.decrypt(current.user.mfaSecret!), code, current.user.lastTotpStep, this.now().getTime());
    if (step === null) return this.failMfa(current, meta);
    const user = await this.users.update(current.user.id, { lastTotpStep: step }, SILENT);
    return this.completeSignIn({ ...current, user }, meta);
  }

  async useRecoveryCode(token: string, code: string, meta: RequestMeta): Promise<MfaResult> {
    const current = await this.pendingWithMfa(token);
    if (!current) return { ok: false, reason: "expired" };
    const codeHash = hashRecoveryCode(code);
    if (!current.user.recoveryCodeHashes.includes(codeHash)) return this.failMfa(current, meta);
    const remaining = current.user.recoveryCodeHashes.filter((h) => h !== codeHash);
    const user = await this.users.update(current.user.id, { recoveryCodeHashes: remaining }, SILENT);
    await this.event("mfa.recovery_used", user, meta, `${remaining.length} recovery codes left`);
    return this.completeSignIn({ ...current, user }, meta);
  }

  async signOut(token: string | undefined, meta: RequestMeta): Promise<void> {
    const current = await this.getSession(token);
    if (!current) return;
    await this.sessions.delete(current.session.id, SILENT);
    await this.event("logout", current.user, meta);
  }

  /** Changes the password, signs the user out everywhere else, and returns a new session token. */
  async changePassword(current: CurrentSession, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<PasswordResult> {
    if (!current.user.passwordHash || !(await verifyPassword(current.user.passwordHash, currentPassword))) {
      return { ok: false, problems: ["Your current password is incorrect."] };
    }
    const problems = checkPasswordPolicy(newPassword, current.user);
    if (newPassword === currentPassword) problems.push("Choose a password different from your current one.");
    if (problems.length) return { ok: false, problems };

    const user = await this.users.update(
      current.user.id,
      { passwordHash: await hashPassword(newPassword), mustChangePassword: false, sessionVersion: current.user.sessionVersion + 1 },
      SILENT,
    );
    await this.sessions.delete(current.session.id, SILENT).catch(() => undefined);
    await this.event("password.changed", user, meta);
    return { ok: true, token: await this.createSession(user, true, meta) };
  }

  // ---- Administration (callers must check the "users:manage" permission) ----

  async createUser(
    agencyId: string,
    actorId: string,
    input: { email: string; name: string; role: User["role"]; temporaryPassword: string },
  ): Promise<{ ok: true; user: User } | { ok: false; problems: string[] }> {
    const problems = checkPasswordPolicy(input.temporaryPassword, input);
    if (problems.length) return { ok: false, problems };
    const user = await this.store.forAgency(agencyId, actorId).users.create({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.temporaryPassword),
      mustChangePassword: true,
    });
    return { ok: true, user };
  }

  async setActive(agencyId: string, actorId: string, userId: string, active: boolean): Promise<User> {
    this.assertNotSelf(actorId, userId, "deactivate");
    const users = this.store.forAgency(agencyId, actorId).users;
    const user = await this.requireUser(agencyId, actorId, userId);
    return users.update(userId, { active, sessionVersion: user.sessionVersion + 1 });
  }

  async setRole(agencyId: string, actorId: string, userId: string, role: User["role"]): Promise<User> {
    this.assertNotSelf(actorId, userId, "change the role of");
    const user = await this.requireUser(agencyId, actorId, userId);
    return this.store.forAgency(agencyId, actorId).users.update(userId, { role, sessionVersion: user.sessionVersion + 1 });
  }

  /** Clears MFA so the user enrolls again at next sign-in (e.g. lost phone). Signs them out everywhere. */
  async resetMfa(agencyId: string, actorId: string, userId: string, meta: RequestMeta): Promise<User> {
    const before = await this.requireUser(agencyId, actorId, userId);
    const user = await this.store.forAgency(agencyId, actorId).users.update(userId, {
      mfaSecret: undefined,
      mfaConfirmedAt: undefined,
      lastTotpStep: undefined,
      recoveryCodeHashes: [],
      sessionVersion: before.sessionVersion + 1,
    });
    await this.store.audit.event({ action: "mfa.reset", agencyId, actorId, userId, ...meta });
    return user;
  }

  async unlock(agencyId: string, actorId: string, userId: string, meta: RequestMeta): Promise<User> {
    await this.requireUser(agencyId, actorId, userId);
    const user = await this.store.forAgency(agencyId, actorId).users.update(userId, { failedLoginCount: 0, lockedUntil: undefined });
    await this.store.audit.event({ action: "user.unlocked", agencyId, actorId, userId, ...meta });
    return user;
  }

  /** Sets a new temporary password (user must change it at next sign-in) and signs them out everywhere. */
  async resetPassword(agencyId: string, actorId: string, userId: string, temporaryPassword: string): Promise<{ ok: true } | { ok: false; problems: string[] }> {
    const user = await this.requireUser(agencyId, actorId, userId);
    const problems = checkPasswordPolicy(temporaryPassword, user);
    if (problems.length) return { ok: false, problems };
    await this.store.forAgency(agencyId, actorId).users.update(userId, {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      sessionVersion: user.sessionVersion + 1,
    });
    return { ok: true };
  }

  // ---- internals ----

  private async requireUser(agencyId: string, actorId: string, userId: string): Promise<User> {
    const user = await this.store.forAgency(agencyId, actorId).users.get(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  private assertNotSelf(actorId: string, userId: string, verb: string): void {
    if (actorId === userId) throw new Error(`You can't ${verb} your own account. Ask another admin.`);
  }

  private async pendingWithMfa(token: string): Promise<CurrentSession | null> {
    const current = await this.getSession(token);
    if (!current || current.session.mfaVerified || !current.user.mfaConfirmedAt || !current.user.mfaSecret) return null;
    return current;
  }

  private async failMfa(current: CurrentSession, meta: RequestMeta): Promise<MfaResult> {
    const attempts = current.session.mfaAttempts + 1;
    await this.event("mfa.failure", current.user, meta, `attempt ${attempts}`);
    if (attempts >= this.policy.maxMfaAttempts) {
      await this.sessions.delete(current.session.id, SILENT).catch(() => undefined);
      return { ok: false, reason: "too_many" };
    }
    await this.sessions.update(current.session.id, { mfaAttempts: attempts }, SILENT);
    return { ok: false, reason: "invalid" };
  }

  private async completeSignIn(current: CurrentSession, meta: RequestMeta, recoveryCodes?: string[]): Promise<MfaResult> {
    await this.sessions.delete(current.session.id, SILENT).catch(() => undefined);
    const user = await this.users.update(current.user.id, { lastLoginAt: this.now().toISOString() }, SILENT);
    const token = await this.createSession(user, true, meta);
    await this.event("login.success", user, meta);
    return { ok: true, token, mustChangePassword: user.mustChangePassword, recoveryCodes };
  }

  private async createSession(user: User, mfaVerified: boolean, meta: RequestMeta): Promise<string> {
    const now = this.now();
    await this.pruneExpired(now);
    const token = randomBytes(32).toString("base64url");
    const lifetimeMs = mfaVerified ? this.policy.maxHours * 3_600_000 : this.policy.pendingMinutes * 60_000;
    await this.sessions.create(
      {
        agencyId: user.agencyId,
        tokenHash: hashToken(token),
        userId: user.id,
        mfaVerified,
        sessionVersion: user.sessionVersion,
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
      } as never,
      SILENT,
    );
    return token;
  }

  private async pruneExpired(now: Date): Promise<void> {
    const t = now.getTime();
    const idleMs = this.policy.idleMinutes * 60_000;
    await this.sessions.removeWhere(
      (s) => new Date(s.expiresAt).getTime() <= t || (s.mfaVerified && new Date(s.lastSeenAt).getTime() + idleMs <= t),
      SILENT,
    );
  }

  private event(action: Parameters<Store["audit"]["event"]>[0]["action"], user: User | null, meta: RequestMeta, detail?: string) {
    return this.store.audit.event({
      action,
      agencyId: user?.agencyId ?? null,
      actorId: user?.id ?? null,
      userId: user?.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail,
    });
  }
}
