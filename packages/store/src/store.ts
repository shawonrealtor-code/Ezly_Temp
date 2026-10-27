import { join } from "node:path";
import { z } from "zod";
import { AuditLog } from "./audit.ts";
import { Collection, type StoredRecord, type WriteContext } from "./collection.ts";
import { FieldCipher } from "./crypto.ts";
import type { AuthAction } from "./schemas.ts";
import {
  accountSchema,
  activitySchema,
  agencySchema,
  applicationSchema,
  carrierSchema,
  policySchema,
  quoteRunSchema,
  sessionSchema,
  taskSchema,
  userSchema,
} from "./schemas.ts";

type TenantSchema = z.ZodType<StoredRecord & { agencyId: string }>;

/**
 * A collection seen through one agency: it can only list, read and change that agency's records,
 * and new records are always stamped with that agency. This is Ezly's tenant isolation.
 */
export class AgencyCollection<S extends TenantSchema> {
  constructor(
    private readonly inner: Collection<S>,
    private readonly agencyId: string,
    private readonly actorId: string | null,
  ) {}

  list(filter?: (record: z.output<S>) => boolean): Promise<z.output<S>[]> {
    return this.inner.list((r) => r.agencyId === this.agencyId && (!filter || filter(r)));
  }

  async get(id: string): Promise<z.output<S> | null> {
    const record = await this.inner.get(id);
    return record && record.agencyId === this.agencyId ? record : null;
  }

  async count(filter?: (record: z.output<S>) => boolean): Promise<number> {
    return (await this.list(filter)).length;
  }

  create(input: Omit<z.input<S>, "id" | "createdAt" | "updatedAt" | "agencyId">): Promise<z.output<S>> {
    return this.inner.create({ ...input, agencyId: this.agencyId } as never, this.ctx());
  }

  createMany(inputs: Omit<z.input<S>, "id" | "createdAt" | "updatedAt" | "agencyId">[]): Promise<z.output<S>[]> {
    return this.inner.createMany(inputs.map((input) => ({ ...input, agencyId: this.agencyId }) as never), this.ctx());
  }

  /** Deletes this agency's records that match, in one write. */
  removeWhere(filter: (record: z.output<S>) => boolean): Promise<number> {
    return this.inner.removeWhere((r) => r.agencyId === this.agencyId && filter(r), this.ctx());
  }

  update(id: string, patch: Partial<z.input<S>>): Promise<z.output<S>> {
    return this.inner.update(id, patch, this.ctx());
  }

  delete(id: string): Promise<void> {
    return this.inner.delete(id, this.ctx());
  }

  private ctx(): WriteContext {
    return { actorId: this.actorId, agencyId: this.agencyId };
  }
}

export interface StoreOptions {
  /** Private directory for data files. Must not be inside the public web folder. */
  dataDir: string;
  /** Base64 32-byte keys; the first encrypts, all decrypt (for rotation). */
  fieldKeys: string[];
}

export function createStore({ dataDir, fieldKeys }: StoreOptions) {
  const collectionsDir = join(dataDir, "collections");
  const audit = new AuditLog(join(dataDir, "audit"));
  const make = <S extends z.ZodType<StoredRecord>>(name: string, schema: S, opts: { uniqueBy?: (r: z.output<S>) => string; uniqueLabel?: string } = {}) =>
    new Collection(name, collectionsDir, schema, {
      ...opts,
      onWrite: (event) => audit.record(name, event as never),
    });

  const tenantCollections = {
    users: make("users", userSchema, { uniqueBy: (u) => u.email, uniqueLabel: "email" }),
    carriers: make("carriers", carrierSchema, { uniqueBy: (c) => `${c.agencyId}:${c.adapterKey}`, uniqueLabel: "carrier key" }),
    accounts: make("accounts", accountSchema),
    activities: make("activities", activitySchema),
    applications: make("applications", applicationSchema),
    quoteRuns: make("quoteRuns", quoteRunSchema),
    policies: make("policies", policySchema),
    tasks: make("tasks", taskSchema),
  };

  return {
    cipher: new FieldCipher(fieldKeys),
    audit,
    /** Agencies are global; only platform setup and the seed script create them. */
    agencies: make("agencies", agencySchema),
    /** Global user lookup, needed for sign-in before the agency is known. */
    usersByEmail: async (email: string) =>
      (await tenantCollections.users.list((u) => u.email === email.trim().toLowerCase()))[0] ?? null,
    /**
     * Unscoped access for the sign-in system only (it runs before the agency is known).
     * Application code must use forAgency().
     */
    internal: {
      users: tenantCollections.users,
      // Sessions change on every sign-in and are not audited as record changes; sign-in events are logged instead.
      sessions: new Collection("sessions", collectionsDir, sessionSchema, { uniqueBy: (s) => s.tokenHash, uniqueLabel: "token" }),
    },
    /** Everything an agency's staff work with, limited to that agency. */
    forAgency(agencyId: string, actorId: string | null = null) {
      const scope = <S extends TenantSchema>(c: Collection<S>) => new AgencyCollection(c, agencyId, actorId);
      return {
        users: scope(tenantCollections.users),
        carriers: scope(tenantCollections.carriers),
        accounts: scope(tenantCollections.accounts),
        activities: scope(tenantCollections.activities),
        applications: scope(tenantCollections.applications),
        quoteRuns: scope(tenantCollections.quoteRuns),
        policies: scope(tenantCollections.policies),
        tasks: scope(tenantCollections.tasks),
        auditTrail: (recordId?: string, limit?: number) => audit.list({ agencyId, recordId, limit }),
        /** Logs a security-relevant action by this user (e.g. revealing an SSN, exporting data). */
        logEvent: (action: AuthAction, detail: string, recordId?: string, meta: { ip?: string; userAgent?: string } = {}) =>
          audit.event({ action, agencyId, actorId, userId: recordId, detail, ...meta }),
      };
    },
  };
}

export type Store = ReturnType<typeof createStore>;
export type AgencyStore = ReturnType<Store["forAgency"]>;
