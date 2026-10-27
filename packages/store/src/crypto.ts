import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { StoreError } from "./errors.ts";

const PREFIX = "enc:v1:";

/** An encrypted value as stored on disk: `enc:v1:<keyId>:<iv>:<tag>:<ciphertext>` (base64url parts). */
export type Encrypted = `enc:v1:${string}`;

export const isEncrypted = (value: unknown): value is Encrypted =>
  typeof value === "string" && value.startsWith(PREFIX);

/**
 * AES-256-GCM field encryption for Restricted data (SSN, driver's license, bank details).
 * The first key encrypts; every key can decrypt, so keys can be rotated without downtime.
 */
export class FieldCipher {
  private readonly keys: { id: string; key: Buffer }[];

  constructor(base64Keys: string[]) {
    if (base64Keys.length === 0) throw new StoreError("At least one field encryption key is required", "CONFIG");
    this.keys = base64Keys.map((k) => {
      const key = Buffer.from(k, "base64");
      if (key.length !== 32) throw new StoreError("Field encryption keys must be 32 bytes, base64-encoded", "CONFIG");
      return { id: createHash("sha256").update(key).digest("hex").slice(0, 8), key };
    });
  }

  static generateKey(): string {
    return randomBytes(32).toString("base64");
  }

  encrypt(plaintext: string): Encrypted {
    const { id, key } = this.keys[0];
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const parts = [id, iv, cipher.getAuthTag(), ciphertext].map((p) =>
      typeof p === "string" ? p : p.toString("base64url"),
    );
    return `${PREFIX}${parts.join(":")}` as Encrypted;
  }

  decrypt(value: Encrypted): string {
    const [id, iv, tag, ciphertext] = value.slice(PREFIX.length).split(":");
    const entry = this.keys.find((k) => k.id === id);
    if (!entry || !iv || !tag || ciphertext === undefined) {
      throw new StoreError("Encrypted value uses an unknown key or is malformed", "CORRUPT");
    }
    const decipher = createDecipheriv("aes-256-gcm", entry.key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }

  /** True when the value was encrypted with an older key and should be re-encrypted. */
  needsRotation(value: Encrypted): boolean {
    return !value.startsWith(`${PREFIX}${this.keys[0].id}:`);
  }
}
