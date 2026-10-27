import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FieldCipher, StoreError, createStore, type AccountInput, type Store } from "./index.ts";

let dataDir: string;
let store: Store;
let agencyA: string;
let agencyB: string;

const person = { firstName: "Test", lastName: "Client" };
const account = (extra: Partial<AccountInput> = {}): AccountInput => ({ people: [person], ...extra });

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "ezly-store-"));
  store = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
  agencyA = (await store.agencies.create({ name: "Agency A" }, { actorId: null })).id;
  agencyB = (await store.agencies.create({ name: "Agency B" }, { actorId: null })).id;
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

describe("records", () => {
  it("creates, reads, updates and deletes", async () => {
    const accounts = store.forAgency(agencyA).accounts;
    const created = await accounts.create(account());
    expect(created.people[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(created.leadStatus).toBe("NEW");

    const updated = await accounts.update(created.id, { leadStatus: "QUOTED" });
    expect(updated.leadStatus).toBe("QUOTED");
    expect(updated.createdAt).toBe(created.createdAt);

    await accounts.delete(created.id);
    expect(await accounts.get(created.id)).toBeNull();
  });

  it("persists to disk so a new store instance sees the data", async () => {
    const { id } = await store.forAgency(agencyA).accounts.create(account());
    const reopened = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
    expect(await reopened.forAgency(agencyA).accounts.get(id)).not.toBeNull();
  });

  it("rejects invalid records with a readable message", async () => {
    const accounts = store.forAgency(agencyA).accounts;
    await expect(accounts.create({ people: [] })).rejects.toThrow(/people/);
    await expect(
      accounts.create(account({ addresses: [{ line1: "1 Main St", city: "Columbia", state: "MD", zip: "12" }] })),
    ).rejects.toThrow(/ZIP must be 5 digits/);
  });

  it("cannot change a record's id, agency or creation time", async () => {
    const accounts = store.forAgency(agencyA).accounts;
    const created = await accounts.create(account());
    const updated = await accounts.update(created.id, { id: "x", agencyId: agencyB, createdAt: "2000-01-01T00:00:00.000Z" } as never);
    expect([updated.id, updated.agencyId, updated.createdAt]).toEqual([created.id, agencyA, created.createdAt]);
  });

  it("enforces unique user emails, ignoring case", async () => {
    const users = store.forAgency(agencyA).users;
    await users.create({ email: "Jordan@Example.com", name: "Jordan" });
    await expect(users.create({ email: "jordan@example.com", name: "Other" })).rejects.toThrow(/email/);
    expect((await store.usersByEmail("JORDAN@example.com"))?.name).toBe("Jordan");
  });
});

describe("agency isolation", () => {
  it("never lets one agency see or change another agency's records", async () => {
    const theirs = await store.forAgency(agencyB).accounts.create(account());
    const mine = store.forAgency(agencyA).accounts;

    expect(await mine.get(theirs.id)).toBeNull();
    expect(await mine.list()).toEqual([]);
    await expect(mine.update(theirs.id, { vip: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(mine.delete(theirs.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await store.forAgency(agencyB).accounts.get(theirs.id))?.vip).toBe(false);
  });

  it("stamps new records with the caller's agency even if another is supplied", async () => {
    const created = await store.forAgency(agencyA).accounts.create({ ...account(), agencyId: agencyB } as never);
    expect(created.agencyId).toBe(agencyA);
  });
});

describe("encryption of Restricted fields", () => {
  it("refuses to save a plaintext SSN", async () => {
    await expect(
      store.forAgency(agencyA).accounts.create(account({ people: [{ ...person, ssn: "123-45-6789" }] })),
    ).rejects.toBeInstanceOf(StoreError);
  });

  it("stores only ciphertext on disk and decrypts with the key", async () => {
    const ssn = "123-45-6789";
    const created = await store
      .forAgency(agencyA)
      .accounts.create(account({ people: [{ ...person, ssn: store.cipher.encrypt(ssn), ssnLast4: "6789" }] }));
    const onDisk = await readFile(join(dataDir, "collections", "accounts.json"), "utf8");
    expect(onDisk).not.toContain(ssn);
    expect(onDisk).not.toContain("123456789");
    expect(store.cipher.decrypt(created.people[0].ssn!)).toBe(ssn);
  });

  it("fails to decrypt with the wrong key, and supports key rotation", () => {
    const oldKey = FieldCipher.generateKey();
    const old = new FieldCipher([oldKey]);
    const value = old.encrypt("A1234567");
    expect(() => new FieldCipher([FieldCipher.generateKey()]).decrypt(value)).toThrow();
    const rotated = new FieldCipher([FieldCipher.generateKey(), oldKey]);
    expect(rotated.decrypt(value)).toBe("A1234567");
    expect(rotated.needsRotation(value)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt("x"))).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = new FieldCipher([FieldCipher.generateKey()]);
    const value = cipher.encrypt("secret");
    const tampered = (value.slice(0, -2) + (value.endsWith("A") ? "BB" : "AA")) as typeof value;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });
});

describe("crash safety and concurrency", () => {
  it("keeps every write when many happen at once", async () => {
    const accounts = store.forAgency(agencyA).accounts;
    await Promise.all(Array.from({ length: 50 }, (_, i) => accounts.create(account({ labels: [`n${i}`] }))));
    const reopened = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
    expect(await reopened.forAgency(agencyA).accounts.count()).toBe(50);
  });

  it("keeps every write when two store instances (like two processes) write together", async () => {
    const other = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
    await Promise.all([
      ...Array.from({ length: 20 }, () => store.forAgency(agencyA).accounts.create(account())),
      ...Array.from({ length: 20 }, () => other.forAgency(agencyA).accounts.create(account())),
    ]);
    expect(await store.forAgency(agencyA).accounts.count()).toBe(40);
  });

  it("sees changes written by another instance", async () => {
    const other = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
    expect(await store.forAgency(agencyA).accounts.count()).toBe(0);
    await other.forAgency(agencyA).accounts.create(account());
    expect(await store.forAgency(agencyA).accounts.count()).toBe(1);
  });

  it("ignores leftover temp files from a crash and leaves none behind normally", async () => {
    const accounts = store.forAgency(agencyA).accounts;
    await accounts.create(account());
    const dir = join(dataDir, "collections");
    await writeFile(join(dir, "accounts.json.999.deadbeef.tmp"), '{"half-writ');
    await accounts.create(account());
    expect(await accounts.count()).toBe(2);
    const temps = (await readdir(dir)).filter((f) => f.endsWith(".tmp") && !f.includes("deadbeef"));
    expect(temps).toEqual([]);
  });

  it("breaks a stale lock left by a crashed process", async () => {
    const lock = join(dataDir, "collections", "accounts.json.lock");
    await writeFile(lock, "12345");
    const { utimes } = await import("node:fs/promises");
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await store.forAgency(agencyA).accounts.create(account());
    expect(await store.forAgency(agencyA).accounts.count()).toBe(1);
  });

  it("refuses to load a damaged file instead of silently losing data", async () => {
    await store.forAgency(agencyA).accounts.create(account());
    await writeFile(join(dataDir, "collections", "accounts.json"), "{ not json");
    const reopened = createStore({ dataDir, fieldKeys: [FieldCipher.generateKey()] });
    await expect(reopened.forAgency(agencyA).accounts.list()).rejects.toMatchObject({ code: "CORRUPT" });
  });
});

describe("audit log", () => {
  it("records who changed what, newest first, without Restricted values", async () => {
    const actor = (await store.forAgency(agencyA).users.create({ email: "a@example.com", name: "A" })).id;
    const accounts = store.forAgency(agencyA, actor).accounts;
    const created = await accounts.create(account({ people: [{ ...person, ssn: store.cipher.encrypt("123-45-6789") }] }));
    await accounts.update(created.id, { leadStatus: "CONTACTED" });

    const trail = await store.forAgency(agencyA).auditTrail(created.id);
    expect(trail.map((e) => e.action)).toEqual(["update", "create"]);
    expect(trail[0]).toMatchObject({ actorId: actor, changes: { leadStatus: { from: "NEW", to: "CONTACTED" } } });
    expect(JSON.stringify(trail)).not.toContain("enc:v1:");
    expect(JSON.stringify(trail)).toContain("[encrypted]");
    expect(await store.forAgency(agencyB).auditTrail()).toEqual([]);
  });
});
