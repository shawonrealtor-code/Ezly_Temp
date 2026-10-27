// The client (account) form as edited in the browser: every input is a string or boolean.
// The server converts it to a stored record in lib/accounts.ts. Browser-safe.
import type { AccountLike } from "@ezly/core";

export interface PersonForm {
  id?: string;
  relationship: "primary" | "spouse";
  prefix: string;
  firstName: string;
  middleInitial: string;
  lastName: string;
  suffix: string;
  nickname: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  /** New SSN typed by the user; empty keeps the saved one. Never pre-filled. */
  ssn: string;
  ssnLast4: string;
  dlNumber: string;
  hasDlNumber: boolean;
  dlStatus: string;
  dlState: string;
  education: string;
  industry: string;
  occupation: string;
  preferredLanguage: string;
}

export interface AddressForm {
  line1: string;
  line2: string;
  unit: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  zip4: string;
  yearsAt: string;
  monthsAt: string;
}

export interface ClientForm {
  people: PersonForm[];
  address: AddressForm;
  previousAddress: AddressForm;
  phones: { kind: string; number: string; preferred: boolean }[];
  emails: { kind: string; address: string; preferred: boolean }[];
  preferredContact: string;
  contactTime: string;
  shareEmailWithCarriers: boolean;
  producerId: string;
  csrId: string;
  leadSource: string;
  leadStatus: string;
  leadPriority: string;
  probabilityOfSale: string;
  customerSince: string;
  vip: boolean;
  labels: string;
}

export const emptyPerson = (relationship: PersonForm["relationship"]): PersonForm => ({
  relationship,
  prefix: "",
  firstName: "",
  middleInitial: "",
  lastName: "",
  suffix: "",
  nickname: "",
  gender: "",
  dateOfBirth: "",
  maritalStatus: "",
  ssn: "",
  ssnLast4: "",
  dlNumber: "",
  hasDlNumber: false,
  dlStatus: "",
  dlState: "",
  education: "",
  industry: "",
  occupation: "",
  preferredLanguage: "English",
});

export const emptyAddress = (): AddressForm => ({
  line1: "", line2: "", unit: "", city: "", county: "", state: "", zip: "", zip4: "", yearsAt: "", monthsAt: "",
});

export const emptyClientForm = (defaults: Partial<ClientForm> = {}): ClientForm => ({
  people: [emptyPerson("primary")],
  address: emptyAddress(),
  previousAddress: emptyAddress(),
  phones: [{ kind: "mobile", number: "", preferred: true }],
  emails: [{ kind: "primary", address: "", preferred: true }],
  preferredContact: "",
  contactTime: "",
  shareEmailWithCarriers: false,
  producerId: "",
  csrId: "",
  leadSource: "",
  leadStatus: "NEW",
  leadPriority: "",
  probabilityOfSale: "",
  customerSince: "",
  vip: false,
  labels: "",
  ...defaults,
});

const yearsNum = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));

/** The shape the "Ready to rate?" checklist reads. */
export function formReadinessView(form: ClientForm): AccountLike {
  const previous = form.previousAddress;
  return {
    people: form.people.map((p) => ({ ...p, dateOfBirth: p.dateOfBirth || undefined })),
    addresses: [
      { ...form.address, isPrimary: true, yearsAt: yearsNum(form.address.yearsAt) },
      ...(previous.line1 ? [{ ...previous, kind: "previous", yearsAt: yearsNum(previous.yearsAt) }] : []),
    ],
    phones: form.phones,
  };
}

export const OPTIONS = {
  prefix: ["Mr.", "Mrs.", "Ms.", "Dr."],
  suffix: ["Jr.", "Sr.", "II", "III", "IV"],
  gender: ["Male", "Female", "Non-binary"],
  maritalStatus: ["Single", "Married", "Divorced", "Widowed", "Separated", "Domestic partner"],
  dlStatus: ["Valid", "Learner's permit", "Suspended", "Revoked", "Expired", "Not licensed"],
  education: ["High school", "Some college", "Associate degree", "Bachelor's degree", "Master's degree", "Doctorate"],
  industry: [
    "Agriculture", "Construction", "Education", "Finance", "Government", "Healthcare", "Hospitality", "Information Technology",
    "Insurance", "Legal", "Manufacturing", "Military", "Real Estate", "Retail", "Retired", "Self-employed", "Student",
    "Transportation", "Unemployed", "Other",
  ],
  language: ["English", "Spanish", "Bengali", "Hindi", "Urdu", "Chinese", "Korean", "Vietnamese", "Arabic", "French", "Other"],
  leadSource: ["Referral", "Website", "Walk-in", "Phone call", "Social media", "Carrier lead", "Renewal list", "Other"],
  phoneKind: [["mobile", "Mobile"], ["home", "Home"], ["work", "Work"], ["other", "Other"]],
  emailKind: [["primary", "Primary"], ["work", "Work"], ["other", "Other"]],
} as const;
