import "server-only";
import { MAX_TEXT_LENGTH, hasTextConsent, textProviderFromEnv, toE164 } from "@ezly/messaging";
import type { Account, AgencyStore, User } from "@ezly/store";

/** Texting is off until a provider is configured (see packages/messaging). */
export const textingEnabled = () => textProviderFromEnv() !== null;

/** The number Ezly would text, or why it can't text this client. */
export function textTarget(account: Account): { to: string; display: string } | { reason: string } {
  if (!hasTextConsent(account)) return { reason: "The client hasn't agreed to receive texts. Record their consent on the Details tab first." };
  const phone = account.phones.find((p) => p.kind === "mobile" && p.preferred) ?? account.phones.find((p) => p.kind === "mobile");
  const to = phone ? toE164(phone.number) : null;
  if (!phone || !to) return { reason: "Add a valid mobile number on the Details tab." };
  return { to, display: phone.number };
}

export async function sendClientText(data: AgencyStore, user: User, account: Account, body: string): Promise<{ ok: true } | { error: string }> {
  const provider = textProviderFromEnv();
  if (!provider) return { error: "Texting isn't switched on for this agency yet." };
  const text = body.trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > MAX_TEXT_LENGTH) return { error: `Keep texts under ${MAX_TEXT_LENGTH} characters.` };
  const target = textTarget(account);
  if ("reason" in target) return { error: target.reason };
  try {
    await provider.send({ to: target.to, body: text });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The text couldn't be sent." };
  }
  await data.activities.create({ accountId: account.id, kind: "text", body: `Sent to ${target.display}: ${text}`, occurredAt: new Date().toISOString(), authorId: user.id });
  return { ok: true };
}
