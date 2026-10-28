import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OutboxTextProvider, TwilioTextProvider, hasTextConsent, segmentCount, textProviderFromEnv, toE164 } from "./index.ts";

describe("texting helpers", () => {
  it("normalizes US numbers to E.164 and rejects invalid ones", () => {
    expect(toE164("(410) 555-0175")).toBe("+14105550175");
    expect(toE164("1-410-555-0175")).toBe("+14105550175");
    expect(toE164("555-0175")).toBeNull();
    expect(toE164("(110) 555-0175")).toBeNull();
  });

  it("counts SMS segments", () => {
    expect(segmentCount("a".repeat(160))).toBe(1);
    expect(segmentCount("a".repeat(161))).toBe(2);
    expect(segmentCount("Hi 👋")).toBe(1);
    expect(segmentCount("👋".repeat(40))).toBe(2);
  });

  it("requires consent that hasn't been withdrawn", () => {
    expect(hasTextConsent({})).toBe(false);
    expect(hasTextConsent({ textConsentAt: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(hasTextConsent({ textConsentAt: "2026-10-01T00:00:00Z", textOptOutAt: "2026-10-05T00:00:00Z" })).toBe(false);
    expect(hasTextConsent({ textConsentAt: "2026-10-09T00:00:00Z", textOptOutAt: "2026-10-05T00:00:00Z" })).toBe(true);
  });
});

describe("providers", () => {
  it("is off unless configured", () => {
    expect(textProviderFromEnv({})).toBeNull();
    expect(textProviderFromEnv({ EZLY_SMS_PROVIDER: "twilio", EZLY_TWILIO_ACCOUNT_SID: "AC1" })).toBeNull();
    expect(textProviderFromEnv({ EZLY_SMS_PROVIDER: "twilio", EZLY_TWILIO_ACCOUNT_SID: "AC1", EZLY_TWILIO_AUTH_TOKEN: "t", EZLY_SMS_FROM: "+14105550100" })?.name).toBe("twilio");
  });

  it("writes texts to the outbox folder in development", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ezly-sms-"));
    await new OutboxTextProvider(dir).send({ to: "+14105550175", body: "Hello" });
    const [file] = await readdir(dir);
    expect(JSON.parse(await readFile(join(dir, file), "utf8"))).toEqual({ to: "+14105550175", body: "Hello" });
    await rm(dir, { recursive: true });
  });

  it("sends through Twilio's API with the right request, and reports refusals", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
    }) as unknown as typeof fetch;
    const result = await new TwilioTextProvider("AC1", "secret", "+14105550100", ok).send({ to: "+14105550175", body: "Hi" });
    expect(result.providerMessageId).toBe("SM123");
    expect(calls[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(String(calls[0].init.body)).toBe("To=%2B14105550175&From=%2B14105550100&Body=Hi");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC1:secret").toString("base64")}`);
    const refused = (async () => new Response(JSON.stringify({ message: "Unregistered number" }), { status: 400 })) as unknown as typeof fetch;
    await expect(new TwilioTextProvider("AC1", "s", "+1", refused).send({ to: "+14105550175", body: "Hi" })).rejects.toThrow(/Unregistered number/);
  });
});
