import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./policy.ts";

// Argon2id with OWASP's recommended minimum parameters (19 MiB memory, 2 iterations, 1 lane).
const ARGON2ID = 2 as Algorithm;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };


export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Spends the same time as a real check, so unknown emails can't be detected by response time. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("ezly-dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}

// Most common passwords in public breach lists, plus obvious insurance-agency choices.
const COMMON = new Set([
  "123456789012", "password1234", "password12345", "passwordpassword", "qwertyuiop12", "qwerty123456",
  "iloveyou1234", "welcome12345", "letmein12345", "admin1234567", "administrator", "changeme1234",
  "abc123456789", "111111111111", "000000000000", "123123123123", "1q2w3e4r5t6y", "football1234",
  "baseball1234", "sunshine1234", "princess1234", "monkey123456", "dragon123456", "trustno1trustno1",
  "insurance123", "insurance1234", "insurance2026", "agency123456", "password2026", "password2025",
  "summer2026!!", "winter2026!!", "spring2026!!", "autumn2026!!", "welcome2026!", "p@ssw0rd1234",
]);

/** Returns the problems with a proposed password (empty when acceptable). */
export function checkPasswordPolicy(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push("This password is too common.");
  if (/^(.)\1+$/.test(password)) problems.push("Don't repeat a single character.");
  const emailName = context.email?.split("@")[0]?.toLowerCase();
  if (emailName && emailName.length >= 4 && lower.includes(emailName)) problems.push("Don't include your email address.");
  const nameParts = (context.name ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (nameParts.some((p) => lower.includes(p))) problems.push("Don't include your name.");
  return problems;
}
