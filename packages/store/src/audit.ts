import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isEncrypted } from "./crypto.ts";
import { Mutex, readIfExists } from "./files.ts";
import { auditEntrySchema, type AuditEntry, type AuthAction } from "./schemas.ts";
import type { StoredRecord, WriteEvent } from "./collection.ts";

/** Append-only audit trail, one JSON line per change, one file per month. */
export class AuditLog {
  private readonly mutex = new Mutex();

  constructor(private readonly dir: string) {}

  async record(collection: string, event: WriteEvent<StoredRecord>): Promise<void> {
    const after = event.action === "delete" ? undefined : event.record;
    const before = event.action === "create" ? undefined : event.before;
    const target = (after ?? before)!;
    const entry: AuditEntry = auditEntrySchema.parse({
      id: randomUUID(),
      at: new Date().toISOString(),
      agencyId: target.agencyId ?? null,
      actorId: event.ctx.actorId,
      collection,
      recordId: target.id,
      action: event.action,
      changes: event.action === "update" ? diff(before!, after!) : event.action === "create" ? redact(after) : undefined,
    });
    await this.append(entry);
  }

  /** Records a sign-in or security event (not tied to a record change). */
  async event(event: {
    action: AuthAction;
    agencyId: string | null;
    actorId: string | null;
    userId?: string;
    ip?: string;
    userAgent?: string;
    detail?: string;
  }): Promise<void> {
    await this.append(
      auditEntrySchema.parse({
        id: randomUUID(),
        at: new Date().toISOString(),
        agencyId: event.agencyId,
        actorId: event.actorId,
        collection: "auth",
        recordId: event.userId ?? "unknown",
        action: event.action,
        ip: event.ip,
        userAgent: event.userAgent?.slice(0, 300),
        detail: event.detail,
      }),
    );
  }

  private async append(entry: AuditEntry): Promise<void> {
    await this.mutex.run(async () => {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await appendFile(join(this.dir, `audit-${entry.at.slice(0, 7)}.jsonl`), `${JSON.stringify(entry)}\n`, {
        mode: 0o600,
      });
    });
  }

  /** Most recent entries first. Reads month files newest-first until `limit` matches are found. */
  async list(filter: { agencyId: string; recordId?: string; limit?: number }): Promise<AuditEntry[]> {
    const limit = filter.limit ?? 100;
    const files = await readdir(this.dir).catch(() => [] as string[]);
    const matches: AuditEntry[] = [];
    for (const file of files.filter((f) => f.endsWith(".jsonl")).sort().reverse()) {
      const text = (await readIfExists(join(this.dir, file))) ?? "";
      const entries = text
        .split("\n")
        .filter(Boolean)
        .map((line) => auditEntrySchema.parse(JSON.parse(line)))
        .filter((e) => e.agencyId === filter.agencyId && (!filter.recordId || e.recordId === filter.recordId))
        .reverse();
      matches.push(...entries);
      if (matches.length >= limit) break;
    }
    return matches.slice(0, limit);
  }
}

const IGNORED = new Set(["updatedAt"]);
const SECRET_KEYS = new Set(["passwordHash", "recoveryCodeHashes", "tokenHash"]);

function diff(before: StoredRecord, after: StoredRecord): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (IGNORED.has(key) || JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
    changes[key] = { from: redact(a[key]), to: redact(b[key]) };
  }
  return changes;
}

/** Replaces encrypted values and secrets so the audit log never holds Restricted data. */
function redact(value: unknown): Record<string, unknown> | unknown {
  if (isEncrypted(value)) return "[encrypted]";
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.has(k) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
}
