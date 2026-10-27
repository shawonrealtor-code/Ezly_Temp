// Normalizers shared by forms, search, duplicate checks and imports. Browser-safe.

export const digits = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "");

/** Lowercase, accents removed, punctuation collapsed — for comparing names. */
export function fold(s: string | undefined | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

/** US phone as (410) 555-0175; other lengths are returned trimmed. */
export function formatPhone(raw: string): string {
  let d = digits(raw);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY (two-digit years ≤ current+0 are 2000s, else 1900s). */
export function parseDate(raw: string | undefined, today = new Date()): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) {
    [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
    if (us[3].length === 2) y += y <= today.getFullYear() % 100 ? 2000 : 1900;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function ageOn(dateOfBirth: string, today = new Date()): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export function parseState(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (US_STATES[upper]) return upper;
  const match = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === s.toLowerCase());
  return match ? match[0] : null;
}

export function fullName(p: { firstName: string; lastName: string; middleInitial?: string; suffix?: string }): string {
  return [p.firstName, p.middleInitial, p.lastName, p.suffix].filter(Boolean).join(" ");
}

/** "Maria & Daniel Ortega" for a couple sharing a last name, else "Maria Ortega & Daniel Smith". */
export function householdName(people: { firstName: string; lastName: string; relationship?: string }[]): string {
  const [a, b] = people;
  if (!a) return "";
  if (!b || b.relationship !== "spouse") return `${a.firstName} ${a.lastName}`;
  return a.lastName === b.lastName ? `${a.firstName} & ${b.firstName} ${a.lastName}` : `${a.firstName} ${a.lastName} & ${b.firstName} ${b.lastName}`;
}

export const initials = (name: string) =>
  name
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join("");

export const money = (n: number, cents = false) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 });
