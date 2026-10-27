// "Ready to rate?" checklist: the details carriers need before quoting personal lines.
// Saving a client needs only a first and last name; these items are required later, for rating.

export interface PersonLike {
  relationship?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  industry?: string;
  occupation?: string;
  dlStatus?: string;
}
export interface AddressLike {
  kind?: string;
  isPrimary?: boolean;
  line1?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  yearsAt?: number;
}
export interface AccountLike {
  people: PersonLike[];
  addresses: AddressLike[];
  phones: { number?: string }[];
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** Which form field to focus to fix it. */
  field: string;
}

const has = (...values: (string | number | undefined)[]) => values.every((v) => v !== undefined && String(v).trim() !== "");

export const primaryPerson = <P extends PersonLike>(people: P[]): P | undefined =>
  people.find((p) => (p.relationship ?? "primary") === "primary") ?? people[0];

export const primaryAddress = <A extends AddressLike>(addresses: A[]): A | undefined =>
  addresses.find((a) => a.isPrimary) ?? addresses.find((a) => a.kind !== "previous");

export function ratingReadiness(account: AccountLike): ReadinessItem[] {
  const p = primaryPerson(account.people) ?? {};
  const a = primaryAddress(account.addresses) ?? {};
  const needsPrevious = a.yearsAt !== undefined && a.yearsAt < 3;
  const previous = account.addresses.find((x) => x.kind === "previous");
  return [
    { key: "name", label: "Name & date of birth", done: has(p.firstName, p.lastName, p.dateOfBirth), field: "dateOfBirth" },
    { key: "gender", label: "Gender & marital status", done: has(p.gender, p.maritalStatus), field: "gender" },
    { key: "occupation", label: "Industry & occupation", done: has(p.industry, p.occupation), field: "industry" },
    { key: "address", label: "Street, city, state, ZIP", done: has(a.line1, a.city, a.state, a.zip), field: "line1" },
    { key: "county", label: "County", done: has(a.county), field: "county" },
    { key: "phone", label: "Phone number", done: account.phones.some((ph) => has(ph.number)), field: "phone" },
    { key: "license", label: "Driver's license status", done: has(p.dlStatus), field: "dlStatus" },
    { key: "yearsAt", label: "Years at address", done: a.yearsAt !== undefined, field: "yearsAt" },
    {
      key: "previous",
      label: "Previous address (if under 3 years)",
      done: !needsPrevious || has(previous?.line1, previous?.city, previous?.state, previous?.zip),
      field: "previousLine1",
    },
  ];
}

export const isReadyToRate = (account: AccountLike) => ratingReadiness(account).every((i) => i.done);
