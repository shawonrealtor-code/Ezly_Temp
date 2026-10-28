import { describe, expect, it } from "vitest";
import {
  DuplicateIndex,
  accountMatches,
  ageOn,
  formatPhone,
  guessMapping,
  householdName,
  initials,
  isReadyToRate,
  mapRows,
  parseCsv,
  parseDate,
  parseState,
  ratingReadiness,
  type DuplicateCandidate,
} from "./index.ts";

const today = new Date("2026-10-27T12:00:00Z");

describe("text helpers", () => {
  it("parses common date formats and rejects impossible dates", () => {
    expect(parseDate("1984-03-07")).toBe("1984-03-07");
    expect(parseDate("3/7/1984")).toBe("1984-03-07");
    expect(parseDate("03-07-84", today)).toBe("1984-03-07");
    expect(parseDate("03/07/05", today)).toBe("2005-03-07");
    expect(parseDate("02/30/1990")).toBeNull();
    expect(parseDate("someday")).toBeNull();
  });

  it("formats phones, states, names and ages", () => {
    expect(formatPhone("410.555.0175")).toBe("(410) 555-0175");
    expect(formatPhone("+1 410 555 0175")).toBe("(410) 555-0175");
    expect(parseState("maryland")).toBe("MD");
    expect(parseState("va")).toBe("VA");
    expect(parseState("Narnia")).toBeNull();
    expect(householdName([{ firstName: "Maria", lastName: "Ortega" }, { firstName: "Daniel", lastName: "Ortega", relationship: "spouse" }])).toBe(
      "Maria & Daniel Ortega",
    );
    expect(initials("Maria & Daniel Ortega")).toBe("MO");
    expect(ageOn("1984-10-28", today)).toBe(41);
  });
});

describe("ready to rate", () => {
  const complete = {
    people: [{ firstName: "A", lastName: "B", dateOfBirth: "1980-01-01", gender: "Female", maritalStatus: "Single", industry: "Retail", occupation: "Manager", dlStatus: "Valid" }],
    addresses: [{ isPrimary: true, line1: "1 Main St", city: "Columbia", county: "Howard", state: "MD", zip: "21044", yearsAt: 5 }],
    phones: [{ number: "(410) 555-0175" }],
  };

  it("is ready when every rating field is present", () => {
    expect(isReadyToRate(complete)).toBe(true);
  });

  it("lists what is missing, including a previous address for recent movers", () => {
    const recent = { ...complete, addresses: [{ ...complete.addresses[0], yearsAt: 1 }] };
    expect(ratingReadiness(recent).filter((i) => !i.done).map((i) => i.key)).toEqual(["previous"]);
    const bare = { people: [{ firstName: "A", lastName: "B" }], addresses: [], phones: [] };
    expect(ratingReadiness(bare).filter((i) => i.done).map((i) => i.key)).toEqual(["previous"]);
  });
});

describe("duplicates", () => {
  const existing = {
    id: "a1",
    people: [{ firstName: "María", lastName: "Ortega", dateOfBirth: "1984-03-07" }],
    addresses: [{ zip: "21044", isPrimary: true }],
    phones: [{ number: "(410) 555-0175" }],
    emails: [{ address: "maria@example.com" }],
  };
  const index = new DuplicateIndex([existing]);

  it("finds matches by name + DOB, email, phone, or name + ZIP, ignoring accents and case", () => {
    const match = (c: Partial<DuplicateCandidate>) =>
      index.find({ people: [], addresses: [], phones: [], emails: [], ...c }).map((m) => m.reasons).flat();
    expect(match({ people: [{ firstName: "maria", lastName: "ORTEGA", dateOfBirth: "1984-03-07" }] })).toContain("name and date of birth");
    expect(match({ emails: [{ address: "Maria@Example.com" }] })).toEqual(["email"]);
    expect(match({ phones: [{ number: "1-410-555-0175" }] })).toEqual(["phone"]);
    expect(match({ people: [{ firstName: "Maria", lastName: "Ortega" }], addresses: [{ zip: "21044", isPrimary: true }] })).toEqual(["name and ZIP"]);
    expect(match({ people: [{ firstName: "Maria", lastName: "Ortega", dateOfBirth: "1990-01-01" }] })).toEqual([]);
  });
});

describe("search", () => {
  const account = {
    id: "3f2a9c1e-0000-4000-8000-000000000000",
    people: [{ firstName: "Thomas", lastName: "Nguyễn" }],
    emails: [{ address: "tom@example.com" }],
    phones: [{ number: "(410) 555-0142" }],
    addresses: [{ city: "Baltimore", zip: "21201" }],
  };
  it("matches every word against names, email, phone, city, ZIP and policy numbers", () => {
    expect(accountMatches(account, "thomas nguyen")).toBe(true);
    expect(accountMatches(account, "nguyen baltimore")).toBe(true);
    expect(accountMatches(account, "5550142")).toBe(true);
    expect(accountMatches(account, "212")).toBe(true);
    expect(accountMatches(account, "tom@example")).toBe(true);
    expect(accountMatches(account, "SM-4471", ["SM-4471029"])).toBe(true);
    expect(accountMatches(account, "thomas smith")).toBe(false);
    expect(accountMatches(account, "")).toBe(true);
  });
});

describe("CSV import", () => {
  const csv = [
    "First Name,Last Name,DOB,Gender,Marital Status,SSN,Email,Cell Phone,Address,City,State,Zip,Spouse First Name,Lead Status,Producer",
    'Maria,Ortega,03/07/1984,F,M,123-45-6789,MARIA@EXAMPLE.COM,410.555.0175,"1420 Willow Creek Dr",Columbia,Maryland,21044-2318,Daniel,Customer,Jordan Mitchell',
    "Kevin,Brooks,13/45/1990,?,Single,12345,not-an-email,555,,Arlington,VA,,,,",
    ",,,,,,,,,,,,,,",
    "Ann,Lee,,,,,,,9 Elm St,Hartford,CT,6103,,,",
  ].join("\n");

  it("guesses columns from common header names", () => {
    const { headers } = parseCsv(csv);
    const m = guessMapping(headers);
    expect(m).toMatchObject({ firstName: 0, lastName: 1, dateOfBirth: 2, ssn: 5, email: 6, phone: 7, line1: 8, zip: 11, coFirstName: 12, producer: 14 });
    expect(m.fullName).toBeUndefined();
  });

  it("turns rows into clients, cleaning values and explaining what was dropped", () => {
    const { headers, rows } = parseCsv(csv);
    const [maria, kevin, ann] = mapRows(rows, guessMapping(headers), today);
    expect(maria.errors).toEqual([]);
    expect(maria.warnings).toEqual([]);
    expect(maria.account).toMatchObject({
      people: [
        { firstName: "Maria", dateOfBirth: "1984-03-07", gender: "Female", maritalStatus: "Married", ssnPlain: "123456789" },
        { relationship: "spouse", firstName: "Daniel", lastName: "Ortega" },
      ],
      emails: [{ address: "maria@example.com" }],
      phones: [{ number: "(410) 555-0175", preferred: true }],
      addresses: [{ state: "MD", zip: "21044", zip4: "2318" }],
      leadStatus: "SOLD",
      producer: "Jordan Mitchell",
    });

    expect(kevin.account?.people[0].dateOfBirth).toBeUndefined();
    expect(kevin.warnings.join(" ")).toMatch(/Date of birth.*Gender.*SSN.*Email.*Phone.*address/s);
    expect(kevin.warnings.join(" ")).not.toContain("12345");

    expect(ann.account?.addresses[0].zip).toBe("06103");
    expect(ann.warnings[0]).toMatch(/leading zeros/);
  });

  it("recognizes EZLynx-style headers with Applicant/Insured prefixes", () => {
    const m = guessMapping(["Applicant First Name", "Applicant Last Name", "Insured DOB", "Address Line 1", "Postal Code", "Postal Code Suffix", "Assigned Producer", "CSR", "Co-Applicant First Name", "Mobile Phone"]);
    expect(m).toEqual({ firstName: 0, lastName: 1, dateOfBirth: 2, line1: 3, zip: 4, zip4: 5, producer: 6, csr: 7, coFirstName: 8, phone: 9 });
  });

  it("rejects rows without a name and splits a single full-name column", () => {
    const { headers, rows } = parseCsv("Name,Phone\n\"Ortega, Maria L\",4105550175\nCher,4105550100");
    const [a, b] = mapRows(rows, guessMapping(headers), today);
    expect(a.account?.people[0]).toMatchObject({ firstName: "Maria", lastName: "Ortega", middleInitial: "L" });
    expect(b.errors).toEqual(["First and last name are required."]);
  });
});
