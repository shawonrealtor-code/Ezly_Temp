import { digits, fold } from "./text.ts";

// Client search: every word typed must match something (name, email, phone, city, ZIP, policy number).

export interface SearchableAccount {
  id: string;
  people: { firstName: string; lastName: string; nickname?: string }[];
  emails: { address: string }[];
  phones: { number: string }[];
  addresses: { city: string; zip: string }[];
}

export function accountMatches(account: SearchableAccount, query: string, policyNumbers: string[] = []): boolean {
  const tokens = fold(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const text = fold(
    [
      ...account.people.flatMap((p) => [p.firstName, p.lastName, p.nickname ?? ""]),
      ...account.emails.map((e) => e.address),
      ...account.addresses.map((a) => a.city),
      ...policyNumbers,
    ].join(" "),
  );
  const phoneDigits = account.phones.map((p) => digits(p.number));
  return tokens.every((token) => {
    if (/^\d+$/.test(token)) {
      return (
        (token.length >= 3 && phoneDigits.some((d) => d.includes(token))) ||
        account.addresses.some((a) => a.zip.startsWith(token)) ||
        policyNumbers.some((n) => fold(n).includes(token))
      );
    }
    return text.includes(token) || (token.length >= 6 && account.id.startsWith(token));
  });
}
