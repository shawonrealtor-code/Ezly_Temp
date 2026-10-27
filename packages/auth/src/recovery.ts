import { createHash, randomBytes } from "node:crypto";

// One-time recovery codes for when a phone is lost. Only hashes are stored; codes are shown once.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = [...randomBytes(10)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}
