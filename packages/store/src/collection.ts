import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { StoreError } from "./errors.ts";
import { Mutex, atomicWrite, fileVersion, readIfExists, withFileLock } from "./files.ts";

export interface StoredRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  agencyId?: string;
}

export interface WriteContext {
  actorId: string | null;
  /** When set, the record must belong to this agency or the write fails as "not found". */
  agencyId?: string;
  /** Skips the audit log. Only for bookkeeping that is logged another way (e.g. sign-in counters). */
  silent?: boolean;
}

export type WriteEvent<T> =
  | { action: "create"; record: T; ctx: WriteContext }
  | { action: "update"; before: T; record: T; ctx: WriteContext }
  | { action: "delete"; before: T; ctx: WriteContext };

interface CollectionOptions<T> {
  /** Returns a key that must be unique across the collection (e.g. a user's email). */
  uniqueBy?: (record: T) => string;
  /** Names the unique field in error messages, e.g. "email". */
  uniqueLabel?: string;
  onWrite?: (event: WriteEvent<T>) => Promise<void>;
}

const FORMAT = "ezly-collection";
const IMMUTABLE_KEYS = ["id", "agencyId", "createdAt", "updatedAt"] as const;

/**
 * One collection stored as one JSON file. Reads are served from memory and reloaded only when the
 * file changes on disk. Writes are serialized (in-process mutex + cross-process lock file), validated,
 * and written atomically, so a crash mid-write can never leave a half-written file behind.
 */
export class Collection<S extends z.ZodType<StoredRecord>> {
  readonly file: string;
  private readonly mutex = new Mutex();
  private cache: { version: string | null; records: Map<string, z.output<S>> } | null = null;

  constructor(
    readonly name: string,
    dir: string,
    private readonly schema: S,
    private readonly options: CollectionOptions<z.output<S>> = {},
  ) {
    this.file = join(dir, `${name}.json`);
  }

  async list(filter?: (record: z.output<S>) => boolean): Promise<z.output<S>[]> {
    const records = [...(await this.load()).values()];
    return filter ? records.filter(filter) : records;
  }

  async get(id: string): Promise<z.output<S> | null> {
    return (await this.load()).get(id) ?? null;
  }

  async create(input: Omit<z.input<S>, "id" | "createdAt" | "updatedAt">, ctx: WriteContext): Promise<z.output<S>> {
    const now = new Date().toISOString();
    const record = this.validate({ ...input, id: randomUUID(), createdAt: now, updatedAt: now });
    await this.mutate((records) => {
      this.assertUnique(records, record);
      records.set(record.id, record);
    });
    if (!ctx.silent) await this.options.onWrite?.({ action: "create", record, ctx });
    return record;
  }

  /** Creates many records in a single write (used by imports). All are validated before anything is saved. */
  async createMany(inputs: Omit<z.input<S>, "id" | "createdAt" | "updatedAt">[], ctx: WriteContext): Promise<z.output<S>[]> {
    const now = new Date().toISOString();
    const created = inputs.map((input) => this.validate({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }));
    await this.mutate((records) => {
      for (const record of created) {
        this.assertUnique(records, record);
        records.set(record.id, record);
      }
    });
    if (!ctx.silent) for (const record of created) await this.options.onWrite?.({ action: "create", record, ctx });
    return created;
  }

  async update(id: string, patch: Partial<z.input<S>>, ctx: WriteContext): Promise<z.output<S>> {
    const changes: Record<string, unknown> = { ...patch };
    for (const key of IMMUTABLE_KEYS) delete changes[key];
    const { before, record } = await this.mutate((records) => {
      const before = this.requireOwned(records, id, ctx);
      const record = this.validate({ ...before, ...changes, updatedAt: new Date().toISOString() });
      this.assertUnique(records, record);
      records.set(id, record);
      return { before, record };
    });
    if (!ctx.silent) await this.options.onWrite?.({ action: "update", before, record, ctx });
    return record;
  }

  async delete(id: string, ctx: WriteContext): Promise<void> {
    const before = await this.mutate((records) => {
      const before = this.requireOwned(records, id, ctx);
      records.delete(id);
      return before;
    });
    if (!ctx.silent) await this.options.onWrite?.({ action: "delete", before, ctx });
  }

  /** Deletes every matching record in a single write. Returns how many were removed. */
  async removeWhere(filter: (record: z.output<S>) => boolean, ctx: WriteContext): Promise<number> {
    const removed = await this.mutate((records) => {
      const doomed = [...records.values()].filter(filter);
      for (const record of doomed) records.delete(record.id);
      return doomed;
    });
    if (!ctx.silent) for (const before of removed) await this.options.onWrite?.({ action: "delete", before, ctx });
    return removed.length;
  }

  private validate(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".") || "(record)"}: ${i.message}`);
      throw new StoreError(`Invalid ${this.name} record — ${issues.join("; ")}`, "VALIDATION");
    }
    return result.data;
  }

  private requireOwned(records: Map<string, z.output<S>>, id: string, ctx: WriteContext): z.output<S> {
    const record = records.get(id);
    if (!record || (ctx.agencyId !== undefined && record.agencyId !== ctx.agencyId)) {
      throw new StoreError(`${this.name} record ${id} not found`, "NOT_FOUND");
    }
    return record;
  }

  private assertUnique(records: Map<string, z.output<S>>, record: z.output<S>): void {
    const keyOf = this.options.uniqueBy;
    if (!keyOf) return;
    const key = keyOf(record);
    for (const other of records.values()) {
      if (other.id !== record.id && keyOf(other) === key) {
        throw new StoreError(`Another ${this.name} record already uses this ${this.options.uniqueLabel ?? "value"}`, "VALIDATION");
      }
    }
  }

  private async load(): Promise<Map<string, z.output<S>>> {
    const version = await fileVersion(this.file);
    if (this.cache && this.cache.version === version) return this.cache.records;
    const records = await this.readFromDisk();
    this.cache = { version, records };
    return records;
  }

  private async readFromDisk(): Promise<Map<string, z.output<S>>> {
    const text = await readIfExists(this.file);
    const records = new Map<string, z.output<S>>();
    if (text === null) return records;
    let parsed: { format?: string; records?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StoreError(`${this.file} is not valid JSON`, "CORRUPT");
    }
    if (parsed.format !== FORMAT || !Array.isArray(parsed.records)) {
      throw new StoreError(`${this.file} is not an Ezly collection file`, "CORRUPT");
    }
    for (const raw of parsed.records) {
      const result = this.schema.safeParse(raw);
      if (!result.success) {
        const rid = (raw as { id?: string })?.id ?? "unknown";
        throw new StoreError(`${this.file}: record ${rid} failed validation`, "CORRUPT");
      }
      records.set(result.data.id, result.data);
    }
    return records;
  }

  /** Runs fn against a fresh copy of the records under both locks, then persists the result. */
  private mutate<R>(fn: (records: Map<string, z.output<S>>) => R): Promise<R> {
    return this.mutex.run(() =>
      withFileLock(this.file, async () => {
        const records = new Map(await this.readFromDisk());
        const result = fn(records);
        const body = JSON.stringify({ format: FORMAT, version: 1, collection: this.name, records: [...records.values()] });
        await atomicWrite(this.file, body);
        this.cache = { version: await fileVersion(this.file), records };
        return result;
      }),
    );
  }
}
