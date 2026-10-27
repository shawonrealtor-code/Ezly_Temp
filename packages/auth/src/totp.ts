import { Secret, TOTP } from "otpauth";

// RFC 6238 time-based codes, compatible with Google Authenticator, Microsoft Authenticator, Authy, 1Password.
const PERIOD = 30;

function totp(secretBase32: string, label = "") {
  return new TOTP({ issuer: "Ezly", label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: Secret.fromBase32(secretBase32) });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** The otpauth:// link encoded in the enrollment QR code. */
export function totpUri(secretBase32: string, accountLabel: string): string {
  return totp(secretBase32, accountLabel).toString();
}

/**
 * Checks a 6-digit code, allowing one step of clock drift either way. Returns the accepted time step,
 * or null. Codes at or before `lastStep` are rejected so a code can't be used twice.
 */
export function verifyTotp(secretBase32: string, code: string, lastStep: number | undefined, now = Date.now()): number | null {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totp(secretBase32).validate({ token, timestamp: now, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  return lastStep !== undefined && step <= lastStep ? null : step;
}

/** For tests and the seed script: the current code for a secret. */
export function currentTotp(secretBase32: string, now = Date.now()): string {
  return totp(secretBase32).generate({ timestamp: now });
}
