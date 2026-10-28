import Papa from "papaparse";
import { digits, fold, formatPhone, parseDate, parseState } from "./text.ts";

// Client list import: parse a CSV, guess which column is which, and turn each row into a client
// record (or a list of problems). Runs in the browser for the preview and again on the server.

export const MAX_IMPORT_ROWS = 10_000;

export const IMPORT_FIELDS = [
  { key: "fullName", label: "Full name", aliases: ["name", "full name", "insured name", "client name", "applicant name", "customer name", "insured"] },
  { key: "firstName", label: "First name", aliases: ["first name", "first", "fname", "given name", "insured first name", "applicant first name"] },
  { key: "lastName", label: "Last name", aliases: ["last name", "last", "lname", "surname", "family name", "insured last name", "applicant last name"] },
  { key: "middleInitial", label: "Middle initial", aliases: ["middle initial", "mi", "middle name", "middle"] },
  { key: "dateOfBirth", label: "Date of birth", aliases: ["date of birth", "dob", "birth date", "birthdate", "birthday"] },
  { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
  { key: "maritalStatus", label: "Marital status", aliases: ["marital status", "marital"] },
  { key: "ssn", label: "SSN", aliases: ["ssn", "social security", "social security number", "ss", "ssn number"] },
  { key: "dlNumber", label: "Driver's license #", aliases: ["driver license", "drivers license", "driver s license", "dl", "dl number", "license number", "drivers license number"] },
  { key: "dlState", label: "License state", aliases: ["dl state", "license state", "drivers license state"] },
  { key: "email", label: "Email", aliases: ["email", "e mail", "email address", "primary email", "email 1"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "cell", "cell phone", "mobile phone", "home phone", "primary phone", "mobile number", "cell number"] },
  { key: "phone2", label: "Second phone", aliases: ["work phone", "alternate phone", "other phone", "phone 2", "secondary phone", "business phone"] },
  { key: "line1", label: "Street address", aliases: ["address", "address 1", "address1", "street", "street address", "address line 1", "address line1", "mailing address", "mailing address line 1"] },
  { key: "line2", label: "Address line 2 / unit", aliases: ["address 2", "address2", "address line 2", "address line2", "apt", "unit", "suite"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "county", label: "County", aliases: ["county"] },
  { key: "state", label: "State", aliases: ["state", "st", "province"] },
  { key: "zip", label: "ZIP", aliases: ["zip", "zip code", "zipcode", "postal code", "postal", "zip postal code"] },
  { key: "zip4", label: "ZIP+4", aliases: ["postal code suffix", "zip4", "zip 4", "zip suffix", "plus 4"] },
  { key: "coFirstName", label: "Co-applicant first name", aliases: ["co applicant first name", "coapplicant first name", "spouse first name", "co first name"] },
  { key: "coLastName", label: "Co-applicant last name", aliases: ["co applicant last name", "coapplicant last name", "spouse last name", "co last name"] },
  { key: "coDateOfBirth", label: "Co-applicant date of birth", aliases: ["co applicant dob", "coapplicant dob", "spouse dob", "spouse date of birth", "co applicant date of birth", "co applicant birth date"] },
  { key: "leadSource", label: "Lead source", aliases: ["lead source", "source", "referral source"] },
  { key: "leadStatus", label: "Lead status", aliases: ["lead status", "status", "client status"] },
  { key: "customerSince", label: "Customer since", aliases: ["customer since", "client since", "since"] },
  { key: "producer", label: "Producer", aliases: ["producer", "assigned producer", "agent", "assigned agent", "producer name"] },
  { key: "csr", label: "CSR", aliases: ["csr", "assigned csr", "customer service rep", "customer service representative", "account manager"] },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Column index for each field (fields left out are not imported). */
export type Mapping = Partial<Record<ImportField, number>>;

export interface ImportedPerson {
  relationship: "primary" | "spouse";
  firstName: string;
  lastName: string;
  middleInitial?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  /** Plain text only until the server encrypts it; never stored or logged like this. */
  ssnPlain?: string;
  dlNumberPlain?: string;
  dlState?: string;
}

export interface ImportedAccount {
  people: ImportedPerson[];
  addresses: { line1: string; line2?: string; city: string; county?: string; state: string; zip: string; zip4?: string; isPrimary: true }[];
  phones: { number: string; kind: "mobile" | "work"; preferred: boolean }[];
  emails: { address: string; preferred: boolean }[];
  leadSource?: string;
  leadStatus?: "NEW" | "CONTACTED" | "QUOTED" | "SOLD" | "LOST";
  customerSince?: string;
  producer?: string;
  csr?: string;
}

export interface ImportedRow {
  /** Line number in the file (the header is line 1). */
  line: number;
  account?: ImportedAccount;
  errors: string[];
  warnings: string[];
}

export function parseCsv(text: string): { headers: string[]; rows: string[][]; errors: string[] } {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [headers = [], ...rows] = result.data;
  const errors = result.errors.slice(0, 5).map((e) => `Line ${(e.row ?? 0) + 1}: ${e.message}`);
  if (rows.length > MAX_IMPORT_ROWS) errors.push(`The file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`);
  return { headers: headers.map((h) => h.trim()), rows: rows.slice(0, MAX_IMPORT_ROWS), errors };
}

const normalizeHeader = (h: string) => fold(h).replace(/[^a-z0-9]+/g, " ").trim();
/** "Applicant First Name", "Insured DOB", "Primary Address Line 1" → also try without the prefix. */
const headerVariants = (h: string) => {
  const n = normalizeHeader(h);
  const stripped = n.replace(/^(applicant|insured|primary|client|customer|contact|named insured) /, "");
  return stripped === n ? [n] : [n, stripped];
};

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const aliases = field.aliases as readonly string[];
    const index = headers.findIndex((h, i) => !used.has(i) && headerVariants(h).some((v) => aliases.includes(v)));
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  // A full-name column is only needed when first/last aren't separate.
  if (mapping.firstName !== undefined && mapping.lastName !== undefined) delete mapping.fullName;
  return mapping;
}

const GENDERS: Record<string, string> = { m: "Male", male: "Male", f: "Female", female: "Female", x: "Non-binary", "non binary": "Non-binary", nonbinary: "Non-binary" };
const MARITAL: Record<string, string> = {
  s: "Single", single: "Single", m: "Married", married: "Married", d: "Divorced", divorced: "Divorced",
  w: "Widowed", widowed: "Widowed", sep: "Separated", separated: "Separated", p: "Domestic partner", dp: "Domestic partner",
  "domestic partner": "Domestic partner",
};
const STATUSES: Record<string, ImportedAccount["leadStatus"]> = {
  new: "NEW", lead: "NEW", prospect: "CONTACTED", contacted: "CONTACTED", quoted: "QUOTED",
  sold: "SOLD", customer: "SOLD", client: "SOLD", active: "SOLD", insured: "SOLD", lost: "LOST", dead: "LOST", inactive: "LOST",
};

function splitFullName(raw: string): { firstName: string; lastName: string; middleInitial?: string } | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.includes(",")) {
    const [last, rest = ""] = s.split(",").map((x) => x.trim());
    const [first, middle] = rest.split(" ");
    return first ? { firstName: first, lastName: last, middleInitial: middle?.[0] } : null;
  }
  const parts = s.split(" ");
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts[parts.length - 1], middleInitial: parts.length > 2 ? parts[1][0] : undefined };
}

export function mapRow(row: string[], mapping: Mapping, line: number, today = new Date()): ImportedRow {
  const get = (field: ImportField) => {
    const i = mapping[field];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = (field: ImportField) => IMPORT_FIELDS.find((f) => f.key === field)!.label;

  let name = get("firstName") && get("lastName") ? { firstName: get("firstName"), lastName: get("lastName") } : null;
  if (!name && get("fullName")) name = splitFullName(get("fullName"));
  if (!name) return { line, errors: ["First and last name are required."], warnings };

  const person: ImportedPerson = { relationship: "primary", ...name };
  const middle = get("middleInitial");
  if (middle) person.middleInitial = middle[0].toUpperCase();

  const date = (field: ImportField, maxAge = 120): string | undefined => {
    const raw = get(field);
    if (!raw) return undefined;
    const parsed = parseDate(raw, today);
    const age = parsed ? (today.getTime() - Date.parse(parsed)) / 31_557_600_000 : -1;
    if (!parsed || age < 0 || age > maxAge) {
      warnings.push(`${label(field)} "${raw}" isn't a valid date, so it was left blank.`);
      return undefined;
    }
    return parsed;
  };
  person.dateOfBirth = date("dateOfBirth");

  const gender = get("gender");
  if (gender) {
    person.gender = GENDERS[fold(gender)];
    if (!person.gender) warnings.push(`Gender "${gender}" wasn't recognized, so it was left blank.`);
  }
  const marital = get("maritalStatus");
  if (marital) {
    person.maritalStatus = MARITAL[fold(marital)];
    if (!person.maritalStatus) warnings.push(`Marital status "${marital}" wasn't recognized, so it was left blank.`);
  }

  const ssn = digits(get("ssn"));
  if (ssn) {
    if (ssn.length === 9) person.ssnPlain = ssn;
    else warnings.push("SSN doesn't have 9 digits, so it was left blank."); // never echo the value
  }
  const dl = get("dlNumber").replace(/\s/g, "");
  if (dl) person.dlNumberPlain = dl.toUpperCase();
  const dlState = get("dlState");
  if (dlState) {
    const st = parseState(dlState);
    if (st) person.dlState = st;
    else warnings.push(`License state "${dlState}" wasn't recognized.`);
  }

  const account: ImportedAccount = { people: [person], addresses: [], phones: [], emails: [] };

  if (get("coFirstName")) {
    account.people.push({
      relationship: "spouse",
      firstName: get("coFirstName"),
      lastName: get("coLastName") || person.lastName,
      dateOfBirth: date("coDateOfBirth"),
    });
  }

  const email = get("email").toLowerCase();
  if (email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) account.emails.push({ address: email, preferred: true });
    else warnings.push(`Email "${email}" isn't valid, so it was left out.`);
  }
  for (const [field, kind] of [["phone", "mobile"], ["phone2", "work"]] as const) {
    const raw = get(field);
    if (!raw) continue;
    if (digits(raw).length >= 10) account.phones.push({ number: formatPhone(raw), kind, preferred: account.phones.length === 0 });
    else warnings.push(`${label(field)} "${raw}" is too short, so it was left out.`);
  }

  const addressParts = { line1: get("line1"), city: get("city"), state: get("state"), zip: get("zip") };
  if (Object.values(addressParts).some(Boolean)) {
    const state = parseState(addressParts.state);
    let zipDigits = digits(addressParts.zip);
    if (zipDigits.length === 3 || zipDigits.length === 4) {
      zipDigits = zipDigits.padStart(5, "0");
      warnings.push(`ZIP "${addressParts.zip}" was missing leading zeros (common after opening in Excel); used ${zipDigits}.`);
    }
    const zipOk = zipDigits.length === 5 || zipDigits.length === 9;
    if (addressParts.line1 && addressParts.city && state && zipOk) {
      account.addresses.push({
        line1: addressParts.line1,
        line2: get("line2") || undefined,
        city: addressParts.city,
        county: get("county") || undefined,
        state,
        zip: zipDigits.slice(0, 5),
        zip4: zipDigits.length === 9 ? zipDigits.slice(5) : digits(get("zip4")).length === 4 ? digits(get("zip4")) : undefined,
        isPrimary: true,
      });
    } else {
      warnings.push("The address is incomplete or invalid (needs street, city, state and 5-digit ZIP), so it was left out.");
    }
  }

  const source = get("leadSource");
  if (source) account.leadSource = source;
  const status = get("leadStatus");
  if (status) {
    account.leadStatus = STATUSES[fold(status)];
    if (!account.leadStatus) warnings.push(`Status "${status}" wasn't recognized; set to New.`);
  }
  account.customerSince = date("customerSince", 100);
  const producer = get("producer");
  if (producer) account.producer = producer;
  const csr = get("csr");
  if (csr) account.csr = csr;

  return { line, account, errors, warnings };
}

export function mapRows(rows: string[][], mapping: Mapping, today = new Date()): ImportedRow[] {
  return rows.map((row, i) => mapRow(row, mapping, i + 2, today));
}
