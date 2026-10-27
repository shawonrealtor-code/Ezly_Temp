import { digits, fold } from "./text.ts";
import { primaryAddress } from "./readiness.ts";

// Finds existing clients that look like the same household, so staff don't create duplicates.

export interface DuplicateCandidate {
  people: { firstName: string; lastName: string; dateOfBirth?: string }[];
  addresses: { zip?: string; isPrimary?: boolean; kind?: string }[];
  phones: { number: string }[];
  emails: { address: string }[];
}

export type DuplicateReason = "name and date of birth" | "email" | "phone" | "name and ZIP";

/** Keys that identify a household; two records sharing any key are likely the same client. */
export function duplicateKeys(c: DuplicateCandidate): { key: string; reason: DuplicateReason }[] {
  const keys: { key: string; reason: DuplicateReason }[] = [];
  const zip = primaryAddress(c.addresses)?.zip;
  for (const p of c.people) {
    const name = `${fold(p.lastName)}|${fold(p.firstName)}`;
    if (p.dateOfBirth) keys.push({ key: `nd:${name}|${p.dateOfBirth}`, reason: "name and date of birth" });
    if (zip) keys.push({ key: `nz:${name}|${zip}`, reason: "name and ZIP" });
  }
  for (const e of c.emails) if (e.address) keys.push({ key: `em:${e.address.trim().toLowerCase()}`, reason: "email" });
  for (const ph of c.phones) {
    const d = digits(ph.number).slice(-10);
    if (d.length === 10) keys.push({ key: `ph:${d}`, reason: "phone" });
  }
  return keys;
}

export class DuplicateIndex<T extends DuplicateCandidate & { id: string }> {
  private readonly byKey = new Map<string, T[]>();

  constructor(records: T[] = []) {
    for (const r of records) this.add(r);
  }

  add(record: T): void {
    for (const { key } of duplicateKeys(record)) {
      const list = this.byKey.get(key) ?? [];
      list.push(record);
      this.byKey.set(key, list);
    }
  }

  find(candidate: DuplicateCandidate): { record: T; reasons: DuplicateReason[] }[] {
    const found = new Map<string, { record: T; reasons: Set<DuplicateReason> }>();
    for (const { key, reason } of duplicateKeys(candidate)) {
      for (const record of this.byKey.get(key) ?? []) {
        const entry = found.get(record.id) ?? { record, reasons: new Set<DuplicateReason>() };
        entry.reasons.add(reason);
        found.set(record.id, entry);
      }
    }
    return [...found.values()].map(({ record, reasons }) => ({ record, reasons: [...reasons] }));
  }
}
