import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Text messages (SMS) to clients. OFF by default: nothing is sent unless EZLY_SMS_PROVIDER is set.
// Turning it on later needs only settings, not code:
//   EZLY_SMS_PROVIDER=twilio  EZLY_TWILIO_ACCOUNT_SID=…  EZLY_TWILIO_AUTH_TOKEN=…  EZLY_SMS_FROM=+14105550100
// US rules: business texting numbers must be registered (A2P 10DLC) and clients must agree to receive
// texts (TCPA). Ezly records each client's consent and won't send without it.

export interface TextMessage {
  /** E.164, e.g. +14105550175 */
  to: string;
  body: string;
}

export interface TextProvider {
  name: string;
  send(message: TextMessage): Promise<{ providerMessageId?: string }>;
}

export { MAX_TEXT_LENGTH } from "./limits.ts";

/** US phone → E.164, or null when it isn't a valid 10-digit US number. */
export function toE164(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 && /^[2-9]\d{2}[2-9]/.test(d) ? `+1${d}` : null;
}

/** How many SMS segments a message uses (160 characters each, 153 when split; 70/67 with emoji or non-Latin text). */
export function segmentCount(body: string): number {
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(body);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return body.length <= single ? 1 : Math.ceil(body.length / multi);
}

/** Development stand-in: writes each text to a file instead of sending it. */
export class OutboxTextProvider implements TextProvider {
  readonly name = "outbox";
  constructor(private readonly dir: string) {}
  async send(message: TextMessage) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    await writeFile(join(this.dir, `${id}.json`), JSON.stringify(message, null, 2), { mode: 0o600 });
    return { providerMessageId: id };
  }
}

/** Twilio's Messages API, called directly (no SDK needed). */
export class TwilioTextProvider implements TextProvider {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(message: TextMessage) {
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: message.to, From: this.from, Body: message.body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(`The texting service refused the message${json.message ? `: ${json.message}` : ""}.`);
    return { providerMessageId: json.sid };
  }
}

/** The configured provider, or null when texting is switched off. */
export function textProviderFromEnv(env: Record<string, string | undefined> = process.env): TextProvider | null {
  switch (env.EZLY_SMS_PROVIDER) {
    case "outbox":
      return env.EZLY_SMS_OUTBOX ? new OutboxTextProvider(env.EZLY_SMS_OUTBOX) : null;
    case "twilio":
      return env.EZLY_TWILIO_ACCOUNT_SID && env.EZLY_TWILIO_AUTH_TOKEN && env.EZLY_SMS_FROM
        ? new TwilioTextProvider(env.EZLY_TWILIO_ACCOUNT_SID, env.EZLY_TWILIO_AUTH_TOKEN, env.EZLY_SMS_FROM)
        : null;
    default:
      return null;
  }
}

export interface TextConsent {
  textConsentAt?: string;
  textOptOutAt?: string;
}

/** Whether a client may be texted: they agreed, and haven't opted out since. */
export function hasTextConsent(c: TextConsent): boolean {
  return !!c.textConsentAt && (!c.textOptOutAt || c.textOptOutAt < c.textConsentAt);
}
