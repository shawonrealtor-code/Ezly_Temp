import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { AgencyStore, EmailLog, User } from "@ezly/store";
import { getStore } from "./store";

// All email goes out through the company's own mailboxes (Hostinger: smtp.hostinger.com, port 465):
//  - the shared company mailbox (EZLY_SMTP_USER / EZLY_MAIL_FROM) for automatic emails, and
//  - each employee's company mailbox, connected by an admin on the Users page, for emails they send.
// Every email is logged, and each mailbox is kept under its daily sending limit.
// For development, EZLY_MAIL_OUTBOX saves messages as .eml files instead of sending.

const outbox = () => process.env.EZLY_MAIL_OUTBOX;
const smtpHost = () => process.env.EZLY_SMTP_HOST ?? "smtp.hostinger.com";
const smtpPort = () => Number(process.env.EZLY_SMTP_PORT ?? 465);
/** Hostinger's limit depends on the email plan (about 100/day for email included with hosting). */
export const dailyLimit = () => Number(process.env.EZLY_MAIL_DAILY_LIMIT ?? 100);

export function mailConfigured(): boolean {
  return !!outbox() || !!(process.env.EZLY_SMTP_USER && process.env.EZLY_SMTP_PASS && process.env.EZLY_MAIL_FROM);
}

/** The shared company mailbox's address, from EZLY_MAIL_FROM ("Saha Agency <office@…>"). */
export function agencyMailbox(): { name: string; address: string } | null {
  const from = process.env.EZLY_MAIL_FROM;
  if (!from) return outbox() ? { name: "Ezly", address: "office@example.com" } : null;
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), address: m[2].trim().toLowerCase() } : { name: "", address: from.trim().toLowerCase() };
}

export const domainOf = (address: string) => address.split("@")[1]?.toLowerCase() ?? "";

function transport(auth: { user: string; pass: string }) {
  if (outbox()) return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const port = smtpPort();
  return nodemailer.createTransport({
    host: smtpHost(),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth,
    connectionTimeout: 15_000,
  });
}

/** Logs in to a company mailbox to make sure the address and password work (no email is sent). */
export async function verifyMailbox(address: string, password: string): Promise<{ ok: true } | { error: string }> {
  if (outbox()) return { ok: true };
  try {
    await transport({ user: address, pass: password }).verify();
    return { ok: true };
  } catch {
    return { error: "Couldn't sign in to that mailbox. Check the address and password (they're the same as for webmail)." };
  }
}

async function sentInLastDay(data: AgencyStore, from: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  return data.emailLog.count((e) => e.from === from && e.sentAt > since);
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  kind: EmailLog["kind"];
  accountId?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Sends from the employee's company mailbox when it's connected and under its daily limit; otherwise
 * from the shared company mailbox (replies still go to the employee). Returns the address used.
 */
export async function sendMail(data: AgencyStore, mail: OutgoingMail, sender?: User): Promise<{ from: string }> {
  const agency = agencyMailbox();
  let from: { name: string; address: string; auth: { user: string; pass: string } } | null = null;
  let replyTo: string | undefined;

  if (sender?.mailboxAddress && sender.mailboxPassword && sender.mailboxVerifiedAt && (await sentInLastDay(data, sender.mailboxAddress)) < dailyLimit()) {
    from = { name: sender.name, address: sender.mailboxAddress, auth: { user: sender.mailboxAddress, pass: getStore().cipher.decrypt(sender.mailboxPassword) } };
  } else if (agency) {
    if ((await sentInLastDay(data, agency.address)) >= dailyLimit()) {
      throw new MailLimitError("The company mailbox has reached today's sending limit. Try again tomorrow, or connect more company mailboxes.");
    }
    from = { name: agency.name, address: agency.address, auth: { user: process.env.EZLY_SMTP_USER ?? "", pass: process.env.EZLY_SMTP_PASS ?? "" } };
    replyTo = sender ? (sender.mailboxAddress ?? sender.email) : undefined;
  }
  if (!from) throw new Error("Email isn't set up on this server yet.");

  const message = {
    from: from.name ? { name: from.name, address: from.address } : from.address,
    to: mail.to,
    // The sender keeps a copy in their own mailbox, since sending through the server doesn't fill their Sent folder.
    bcc: from.address === sender?.mailboxAddress ? from.address : undefined,
    replyTo,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments,
  };
  const info = await transport(from.auth).sendMail(message);
  if (outbox()) {
    await mkdir(outbox()!, { recursive: true, mode: 0o700 });
    await writeFile(join(outbox()!, `${Date.now()}-${randomBytes(4).toString("hex")}.eml`), info.message as Buffer, { mode: 0o600 });
  }
  await data.emailLog.create({
    from: from.address,
    to: [mail.to],
    subject: mail.subject.slice(0, 300),
    kind: mail.kind,
    sentById: sender?.id,
    accountId: mail.accountId,
    sentAt: new Date().toISOString(),
  });
  return { from: from.address };
}

export class MailLimitError extends Error {}

/** Which address an email from this user would come from right now (for showing in the UI). */
export function senderAddressFor(user: User): string | null {
  if (user.mailboxAddress && user.mailboxVerifiedAt) return user.mailboxAddress;
  return agencyMailbox()?.address ?? null;
}
