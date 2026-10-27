import "server-only";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  DuplicateIndex,
  accountMatches,
  digits,
  formatPhone,
  householdName,
  mapRows,
  parseDate,
  parseState,
  primaryAddress,
  primaryPerson,
  type DuplicateCandidate,
  type DuplicateReason,
  type ImportedAccount,
  type Mapping,
} from "@ezly/core";
import type { Account, AccountInput, AgencyStore, FieldCipher, User } from "@ezly/store";
import type { ClientForm, PersonForm } from "./client-form";

export type FieldError = { field: string; message: string };

const str = z.string().max(500);
const personFormSchema = z.object({
  id: z.string().optional(),
  relationship: z.enum(["primary", "spouse"]),
  prefix: str, firstName: str, middleInitial: str, lastName: str, suffix: str, nickname: str, gender: str,
  dateOfBirth: str, maritalStatus: str, ssn: str, ssnLast4: str, dlNumber: str, hasDlNumber: z.boolean(),
  dlStatus: str, dlState: str, education: str, industry: str, occupation: str, preferredLanguage: str,
});
const addressFormSchema = z.object({
  line1: str, line2: str, unit: str, city: str, county: str, state: str, zip: str, zip4: str, yearsAt: str, monthsAt: str,
});
export const clientFormSchema = z.object({
  people: z.array(personFormSchema).min(1).max(4),
  address: addressFormSchema,
  previousAddress: addressFormSchema,
  phones: z.array(z.object({ kind: str, number: str, preferred: z.boolean() })).max(5),
  emails: z.array(z.object({ kind: str, address: str, preferred: z.boolean() })).max(5),
  preferredContact: str, contactTime: str, shareEmailWithCarriers: z.boolean(),
  producerId: str, csrId: str, leadSource: str, leadStatus: str, leadPriority: str, probabilityOfSale: str,
  customerSince: str, vip: z.boolean(), labels: z.string().max(1000),
}) satisfies z.ZodType<ClientForm>;

const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const optInt = (s: string, min: number, max: number) => {
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

/** Staff who can be assigned as producer or CSR. */
export async function assignableStaff(data: AgencyStore) {
  const users = (await data.users.list((u) => u.active)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    producers: users.filter((u) => u.role === "ADMIN" || u.role === "PRODUCER").map((u) => ({ id: u.id, name: u.name })),
    csrs: users.filter((u) => u.role !== "READ_ONLY").map((u) => ({ id: u.id, name: u.name })),
  };
}

/**
 * Converts the browser form into a stored record. New SSN / license numbers are encrypted here;
 * blank ones keep what is already saved. Returns field errors instead of throwing.
 */
export async function formToAccount(
  form: ClientForm,
  ctx: { data: AgencyStore; cipher: FieldCipher; existing?: Account },
): Promise<{ input: AccountInput; errors: [] } | { input?: undefined; errors: FieldError[] }> {
  const errors: FieldError[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });

  const people = form.people.map((p: PersonForm, i) => {
    const saved = ctx.existing?.people.find((x) => x.id === p.id);
    const field = (name: string) => `people.${i}.${name}`;
    const who = i === 0 ? "" : "Co-applicant ";
    if (!p.firstName.trim()) err(field("firstName"), `${who}First name is required.`);
    if (!p.lastName.trim()) err(field("lastName"), `${who}Last name is required.`);
    const dob = p.dateOfBirth ? parseDate(p.dateOfBirth) : undefined;
    if (dob === null) err(field("dateOfBirth"), `${who}Date of birth isn't a valid date.`);
    else if (dob && (dob > new Date().toISOString().slice(0, 10) || Number(dob.slice(0, 4)) < 1900)) err(field("dateOfBirth"), `${who}Date of birth is out of range.`);

    let ssn = saved?.ssn;
    let ssnLast4 = saved?.ssnLast4;
    const ssnDigits = digits(p.ssn);
    if (p.ssn.trim()) {
      if (ssnDigits.length !== 9) err(field("ssn"), `${who}SSN must have 9 digits.`);
      else {
        ssn = ctx.cipher.encrypt(ssnDigits);
        ssnLast4 = ssnDigits.slice(-4);
      }
    }
    let dlNumber = saved?.dlNumber;
    if (p.dlNumber.trim()) dlNumber = ctx.cipher.encrypt(p.dlNumber.replace(/\s/g, "").toUpperCase());
    const dlState = p.dlState ? parseState(p.dlState) : undefined;
    if (dlState === null) err(field("dlState"), `${who}License state isn't valid.`);

    return {
      id: p.id && saved ? p.id : undefined,
      relationship: i === 0 ? ("primary" as const) : ("spouse" as const),
      prefix: opt(p.prefix), firstName: p.firstName.trim(), middleInitial: opt(p.middleInitial)?.[0]?.toUpperCase(),
      lastName: p.lastName.trim(), suffix: opt(p.suffix), nickname: opt(p.nickname), gender: opt(p.gender),
      dateOfBirth: dob ?? undefined, maritalStatus: opt(p.maritalStatus), ssn, ssnLast4, dlNumber,
      dlStatus: opt(p.dlStatus), dlState: dlState ?? undefined, education: opt(p.education), industry: opt(p.industry),
      occupation: opt(p.occupation), preferredLanguage: opt(p.preferredLanguage) ?? "English",
    };
  });

  const addresses: AccountInput["addresses"] = [];
  for (const [key, a, kind] of [["address", form.address, "home"], ["previousAddress", form.previousAddress, "previous"]] as const) {
    if (![a.line1, a.city, a.state, a.zip].some((v) => v.trim())) continue;
    const label = kind === "home" ? "Address" : "Previous address";
    const state = parseState(a.state);
    const zip = digits(a.zip);
    if (!a.line1.trim() || !a.city.trim() || !state || (zip.length !== 5 && zip.length !== 9)) {
      err(`${key}.line1`, `${label} needs a street, city, state and 5-digit ZIP.`);
      continue;
    }
    const yearsAt = optInt(a.yearsAt, 0, 100);
    const monthsAt = optInt(a.monthsAt, 0, 11);
    if (Number.isNaN(yearsAt)) err(`${key}.yearsAt`, `${label}: years at address must be 0–100.`);
    if (Number.isNaN(monthsAt)) err(`${key}.monthsAt`, `${label}: months must be 0–11.`);
    addresses.push({
      // Keep the saved id so an unchanged address doesn't show up as a change in the history.
      id: ctx.existing?.addresses.find((x) => x.kind === kind || (kind === "home" && x.isPrimary))?.id,
      kind, isPrimary: kind === "home", line1: a.line1.trim(), line2: opt(a.line2), unit: opt(a.unit), city: a.city.trim(),
      county: opt(a.county), state, zip: zip.slice(0, 5), zip4: zip.length === 9 ? zip.slice(5) : opt(a.zip4),
      yearsAt: Number.isNaN(yearsAt) ? undefined : yearsAt, monthsAt: Number.isNaN(monthsAt) ? undefined : monthsAt,
    });
  }

  const phones = form.phones
    .filter((p) => p.number.trim())
    .map((p, i) => {
      if (digits(p.number).length < 10) err(`phones.${i}.number`, `Phone "${p.number}" needs 10 digits.`);
      const number = formatPhone(p.number);
      const id = ctx.existing?.phones.find((x) => digits(x.number) === digits(number))?.id ?? ctx.existing?.phones[i]?.id;
      return { id, kind: (["mobile", "home", "work", "other"].includes(p.kind) ? p.kind : "mobile") as "mobile", number, preferred: p.preferred };
    });
  if (phones.length && !phones.some((p) => p.preferred)) phones[0].preferred = true;

  const emails = form.emails
    .filter((e) => e.address.trim())
    .map((e, i) => {
      const address = e.address.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) err(`emails.${i}.address`, `Email "${e.address}" isn't valid.`);
      const id = ctx.existing?.emails.find((x) => x.address === address)?.id ?? ctx.existing?.emails[i]?.id;
      return { id, kind: (["primary", "work", "other"].includes(e.kind) ? e.kind : "primary") as "primary", address, preferred: e.preferred };
    });
  if (emails.length && !emails.some((e) => e.preferred)) emails[0].preferred = true;

  const staff = await assignableStaff(ctx.data);
  if (form.producerId && !staff.producers.some((u) => u.id === form.producerId)) err("producerId", "Choose a producer from the list.");
  if (form.csrId && !staff.csrs.some((u) => u.id === form.csrId)) err("csrId", "Choose a CSR from the list.");

  const customerSince = form.customerSince ? parseDate(form.customerSince) : undefined;
  if (customerSince === null) err("customerSince", "Customer since isn't a valid date.");
  const probability = optInt(form.probabilityOfSale, 0, 100);
  if (Number.isNaN(probability)) err("probabilityOfSale", "Probability must be 0–100.");
  const leadStatus = ["NEW", "CONTACTED", "QUOTED", "SOLD", "LOST"].includes(form.leadStatus) ? form.leadStatus : "NEW";

  if (errors.length) return { errors };
  return {
    errors: [],
    input: {
      ...(ctx.existing ? { type: ctx.existing.type, importBatchId: ctx.existing.importBatchId, deletedAt: ctx.existing.deletedAt } : {}),
      people,
      addresses,
      phones,
      emails,
      preferredContact: (["text", "call", "email"].includes(form.preferredContact) ? form.preferredContact : undefined) as AccountInput["preferredContact"],
      contactTime: opt(form.contactTime),
      shareEmailWithCarriers: form.shareEmailWithCarriers,
      producerId: opt(form.producerId),
      csrId: opt(form.csrId),
      leadSource: opt(form.leadSource),
      leadStatus: leadStatus as AccountInput["leadStatus"],
      leadPriority: (["low", "normal", "high"].includes(form.leadPriority) ? form.leadPriority : undefined) as AccountInput["leadPriority"],
      probabilityOfSale: probability,
      customerSince: customerSince ?? undefined,
      vip: form.vip,
      labels: form.labels.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 20),
    },
  };
}

/** Stored record → form for editing. Restricted values are never sent back to the browser. */
export function accountToForm(a: Account): ClientForm {
  const toAddress = (x?: Account["addresses"][number]) => ({
    line1: x?.line1 ?? "", line2: x?.line2 ?? "", unit: x?.unit ?? "", city: x?.city ?? "", county: x?.county ?? "",
    state: x?.state ?? "", zip: x?.zip ?? "", zip4: x?.zip4 ?? "", yearsAt: x?.yearsAt?.toString() ?? "", monthsAt: x?.monthsAt?.toString() ?? "",
  });
  return {
    people: a.people.map((p) => ({
      id: p.id, relationship: p.relationship === "primary" ? "primary" : "spouse", prefix: p.prefix ?? "", firstName: p.firstName,
      middleInitial: p.middleInitial ?? "", lastName: p.lastName, suffix: p.suffix ?? "", nickname: p.nickname ?? "",
      gender: p.gender ?? "", dateOfBirth: p.dateOfBirth ?? "", maritalStatus: p.maritalStatus ?? "", ssn: "",
      ssnLast4: p.ssnLast4 ?? (p.ssn ? "••••" : ""), dlNumber: "", hasDlNumber: !!p.dlNumber, dlStatus: p.dlStatus ?? "",
      dlState: p.dlState ?? "", education: p.education ?? "", industry: p.industry ?? "", occupation: p.occupation ?? "",
      preferredLanguage: p.preferredLanguage,
    })),
    address: toAddress(primaryAddress(a.addresses)),
    previousAddress: toAddress(a.addresses.find((x) => x.kind === "previous")),
    phones: a.phones.length ? a.phones.map(({ kind, number, preferred }) => ({ kind, number, preferred })) : [{ kind: "mobile", number: "", preferred: true }],
    emails: a.emails.length ? a.emails.map(({ kind, address, preferred }) => ({ kind, address, preferred })) : [{ kind: "primary", address: "", preferred: true }],
    preferredContact: a.preferredContact ?? "",
    contactTime: a.contactTime ?? "",
    shareEmailWithCarriers: a.shareEmailWithCarriers,
    producerId: a.producerId ?? "",
    csrId: a.csrId ?? "",
    leadSource: a.leadSource ?? "",
    leadStatus: a.leadStatus,
    leadPriority: a.leadPriority ?? "",
    probabilityOfSale: a.probabilityOfSale?.toString() ?? "",
    customerSince: a.customerSince ?? "",
    vip: a.vip,
    labels: a.labels.join(", "),
  };
}

export interface DuplicateMatch {
  id: string;
  name: string;
  reasons: DuplicateReason[];
}

export async function findDuplicates(data: AgencyStore, candidate: AccountInput, excludeId?: string): Promise<DuplicateMatch[]> {
  const existing = await data.accounts.list((a) => !a.deletedAt && a.id !== excludeId);
  const index = new DuplicateIndex(existing);
  return index
    .find({ people: candidate.people, addresses: candidate.addresses ?? [], phones: candidate.phones ?? [], emails: candidate.emails ?? [] })
    .map(({ record, reasons }) => ({ id: record.id, name: householdName(record.people), reasons }));
}

// ---------- Client list ----------

export interface AccountListQuery {
  q?: string;
  status?: string;
  producerId?: string;
  mine?: boolean;
  sort?: "recent" | "name";
  page?: number;
}

export const PAGE_SIZE = 25;

export async function listAccounts(data: AgencyStore, me: User, query: AccountListQuery) {
  const [accounts, policies, users, activities] = await Promise.all([
    data.accounts.list((a) => !a.deletedAt),
    data.policies.list(),
    data.users.list(),
    data.activities.list(),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const policiesBy = Map.groupBy(policies, (p) => p.accountId);
  const lastActivity = new Map<string, string>();
  for (const act of activities) if ((lastActivity.get(act.accountId) ?? "") < act.occurredAt) lastActivity.set(act.accountId, act.occurredAt);

  const rows = accounts.filter((a) => {
    if (query.status && a.leadStatus !== query.status) return false;
    if (query.producerId && a.producerId !== query.producerId) return false;
    if (query.mine && a.producerId !== me.id && a.csrId !== me.id) return false;
    return !query.q || accountMatches(a, query.q, (policiesBy.get(a.id) ?? []).map((p) => p.policyNumber ?? ""));
  });

  const view = rows.map((a) => {
    const person = primaryPerson(a.people)!;
    const address = primaryAddress(a.addresses);
    const active = (policiesBy.get(a.id) ?? []).filter((p) => p.status === "ACTIVE" || p.status === "BOUND" || p.status === "RENEWING");
    const touched = [a.updatedAt, lastActivity.get(a.id) ?? ""].sort().at(-1)!;
    return {
      id: a.id,
      name: householdName(a.people),
      sortName: `${person.lastName} ${person.firstName}`.toLowerCase(),
      contact: a.emails.find((e) => e.preferred)?.address ?? a.emails[0]?.address ?? a.phones[0]?.number ?? "",
      lines: [...new Set(active.map((p) => p.lob))],
      premium: active.reduce((sum, p) => sum + p.writtenPremium, 0),
      leadStatus: a.leadStatus,
      vip: a.vip,
      producer: a.producerId ? (userName.get(a.producerId) ?? "—") : "Unassigned",
      location: address ? `${address.city}, ${address.state}` : "",
      touched,
    };
  });
  view.sort((x, y) => (query.sort === "name" ? x.sortName.localeCompare(y.sortName) : y.touched.localeCompare(x.touched)));
  const total = view.length;
  const page = Math.max(1, Math.min(query.page ?? 1, Math.ceil(total / PAGE_SIZE) || 1));
  return { total, page, pageCount: Math.ceil(total / PAGE_SIZE), rows: view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

// ---------- Import ----------

export interface ImportPreview {
  total: number;
  ready: number;
  errors: { line: number; messages: string[] }[];
  warnings: { line: number; messages: string[] }[];
  duplicates: { line: number; name: string; matches: { id?: string; name: string; reasons: string[] }[] }[];
  unknownProducers: string[];
}

function importedToInput(account: ImportedAccount, cipher: FieldCipher, producers: Map<string, string>, batchId: string): AccountInput {
  const producerId = account.producer ? producers.get(account.producer.trim().toLowerCase()) : undefined;
  return {
    importBatchId: batchId,
    leadSource: account.leadSource,
    leadStatus: account.leadStatus ?? "NEW",
    customerSince: account.customerSince,
    producerId,
    people: account.people.map(({ ssnPlain, dlNumberPlain, ...p }) => ({
      ...p,
      ssn: ssnPlain ? cipher.encrypt(ssnPlain) : undefined,
      ssnLast4: ssnPlain?.slice(-4),
      dlNumber: dlNumberPlain ? cipher.encrypt(dlNumberPlain) : undefined,
    })),
    addresses: account.addresses,
    phones: account.phones,
    emails: account.emails,
  };
}

async function analyzeImport(data: AgencyStore, rows: string[][], mapping: Mapping) {
  const mapped = mapRows(rows, mapping);
  const staff = await data.users.list((u) => u.active);
  const producers = new Map<string, string>();
  for (const u of staff) {
    producers.set(u.name.toLowerCase(), u.id);
    producers.set(u.email, u.id);
  }
  const existing = await data.accounts.list((a) => !a.deletedAt);
  const index = new DuplicateIndex<DuplicateCandidate & { id: string; name: string; line?: number }>(
    existing.map((a) => ({ ...a, name: householdName(a.people) })),
  );
  const preview: ImportPreview = { total: mapped.length, ready: 0, errors: [], warnings: [], duplicates: [], unknownProducers: [] };
  const unknown = new Set<string>();
  const accepted: { line: number; account: ImportedAccount; duplicate: boolean }[] = [];
  for (const row of mapped) {
    if (!row.account) {
      preview.errors.push({ line: row.line, messages: row.errors });
      continue;
    }
    if (row.warnings.length) preview.warnings.push({ line: row.line, messages: row.warnings });
    if (row.account.producer && !producers.has(row.account.producer.trim().toLowerCase())) unknown.add(row.account.producer);
    const candidate = { ...row.account, emails: row.account.emails, id: `line-${row.line}`, name: householdName(row.account.people), line: row.line };
    const matches = index.find(candidate);
    if (matches.length) {
      preview.duplicates.push({
        line: row.line,
        name: candidate.name,
        matches: matches.map(({ record, reasons }) => ({
          id: record.id.startsWith("line-") ? undefined : record.id,
          name: record.line ? `${record.name} (line ${record.line} of this file)` : record.name,
          reasons,
        })),
      });
    }
    index.add(candidate);
    accepted.push({ line: row.line, account: row.account, duplicate: matches.length > 0 });
    preview.ready++;
  }
  preview.unknownProducers = [...unknown];
  return { preview, accepted, producers };
}

export async function previewImport(data: AgencyStore, rows: string[][], mapping: Mapping): Promise<ImportPreview> {
  return (await analyzeImport(data, rows, mapping)).preview;
}

export async function commitImport(
  data: AgencyStore,
  cipher: FieldCipher,
  rows: string[][],
  mapping: Mapping,
  options: { skipDuplicates: boolean },
): Promise<{ imported: number; skipped: number; batchId: string }> {
  const { preview, accepted, producers } = await analyzeImport(data, rows, mapping);
  const batchId = randomUUID();
  const chosen = accepted.filter((r) => !(options.skipDuplicates && r.duplicate));
  await data.accounts.createMany(chosen.map((r) => importedToInput(r.account, cipher, producers, batchId)));
  return { imported: chosen.length, skipped: preview.total - chosen.length, batchId };
}

/** Removes clients from an import that nobody has changed since. Returns counts. */
export async function undoImport(data: AgencyStore, batchId: string): Promise<{ removed: number; kept: number }> {
  const batch = await data.accounts.list((a) => a.importBatchId === batchId);
  const untouched = new Set(batch.filter((a) => a.updatedAt === a.createdAt).map((a) => a.id));
  const removed = await data.accounts.removeWhere((a) => untouched.has(a.id));
  return { removed, kept: batch.length - removed };
}

// ---------- Client page ----------

/** Loads a client and everything its page shows, limited to the user's agency. 404s if missing. */
export async function loadAccountPage(data: AgencyStore, id: string) {
  const account = await data.accounts.get(id);
  if (!account || account.deletedAt) notFound();
  const [policies, tasks, activities, users, carriers] = await Promise.all([
    data.policies.list((p) => p.accountId === id),
    data.tasks.list((t) => t.accountId === id),
    data.activities.list((a) => a.accountId === id),
    data.users.list(),
    data.carriers.list(),
  ]);
  return {
    account,
    policies,
    tasks,
    activities: activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    userName: new Map(users.map((u) => [u.id, u.name])),
    carrierName: new Map(carriers.map((c) => [c.id, c.name.replace(/ \(simulated\)$/, "")])),
  };
}
