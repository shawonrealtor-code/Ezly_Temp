import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthService, DEFAULT_POLICY, RateLimiter, can, type Permission, type RequestMeta } from "@ezly/auth";
import { getStore } from "./store";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

let service: AuthService | undefined;
export function getAuth(): AuthService {
  service ??= new AuthService(getStore(), {
    idleMinutes: Number(process.env.SESSION_IDLE_MINUTES) || DEFAULT_POLICY.idleMinutes,
    maxHours: Number(process.env.SESSION_MAX_HOURS) || DEFAULT_POLICY.maxHours,
  });
  return service;
}

/** Per-IP limits on top of per-account lockout (single process, so in-memory is enough). */
export const limits = {
  signIn: new RateLimiter(10, 60_000),
  mfa: new RateLimiter(20, 60_000),
  passwordChange: new RateLimiter(10, 60 * 60_000),
};

/**
 * Client IP and browser. Hostinger's proxy appends the real client IP to X-Forwarded-For, so we read
 * from the right (the entries on the left can be forged by the client).
 */
export async function getRequestMeta(): Promise<RequestMeta & { ip: string }> {
  const h = await headers();
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Number(process.env.EZLY_TRUSTED_PROXY_HOPS ?? 1);
  const ip = forwarded[Math.max(forwarded.length - hops, 0)] ?? h.get("x-real-ip") ?? "unknown";
  return { ip, userAgent: h.get("user-agent") ?? undefined };
}

/**
 * Recovery codes waiting to be shown once, right after MFA enrollment. Kept in memory only (never
 * stored in plain text) and removed as soon as the page displays them or after 10 minutes.
 */
const recoveryCodesToShow = new Map<string, { codes: string[]; expires: number }>();

export function holdRecoveryCodes(userId: string, codes: string[]) {
  recoveryCodesToShow.set(userId, { codes, expires: Date.now() + 10 * 60_000 });
}

export function takeRecoveryCodes(userId: string): string[] | null {
  const entry = recoveryCodesToShow.get(userId);
  recoveryCodesToShow.delete(userId);
  return entry && entry.expires > Date.now() ? entry.codes : null;
}

export async function setSessionCookie(token: string, fullSession: boolean) {
  const { maxHours, pendingMinutes } = getAuth().policy;
  const seconds = fullSession ? maxHours * 3600 : pendingMinutes * 60;
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(seconds));
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The session for this request (looked up once per request). */
export const getCurrentSession = cache(async () => getAuth().getSession(await sessionToken()));

/**
 * The Data Access Layer entry point: every protected page and server action calls this first.
 * It sends the user to sign-in, MFA, or a forced password change as needed, enforces the permission,
 * and returns data access limited to the user's agency, with the user recorded as the actor.
 */
export async function requireUser(permission?: Permission, options: { allowPasswordChange?: boolean } = {}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.session.mfaVerified) redirect(current.user.mfaConfirmedAt ? "/mfa" : "/mfa/setup");
  if (current.user.mustChangePassword && !options.allowPasswordChange) redirect("/account/password");
  if (permission && !can(current.user.role, permission)) redirect("/forbidden");
  const { user, session } = current;
  return {
    user,
    session,
    can: (p: Permission) => can(user.role, p),
    data: getStore().forAgency(user.agencyId, user.id),
  };
}
