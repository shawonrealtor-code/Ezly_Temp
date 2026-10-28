import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";

// Email goes out through the agency's own mailbox (e.g. Hostinger: smtp.hostinger.com, port 465) — no
// email service fees. For development, EZLY_MAIL_OUTBOX saves messages as .eml files instead of sending.

export function mailConfigured(): boolean {
  return !!process.env.EZLY_MAIL_OUTBOX || !!(process.env.EZLY_SMTP_HOST && process.env.EZLY_SMTP_USER && process.env.EZLY_MAIL_FROM);
}

export interface Mail {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = process.env.EZLY_MAIL_FROM ?? "Ezly <no-reply@localhost>";
  const outbox = process.env.EZLY_MAIL_OUTBOX;
  if (outbox) {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const info = await transport.sendMail({ from, ...mail });
    await mkdir(outbox, { recursive: true, mode: 0o700 });
    await writeFile(join(outbox, `${Date.now()}-${randomBytes(4).toString("hex")}.eml`), info.message as Buffer, { mode: 0o600 });
    return;
  }
  const port = Number(process.env.EZLY_SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.EZLY_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.EZLY_SMTP_USER, pass: process.env.EZLY_SMTP_PASS },
  });
  await transport.sendMail({ from, ...mail });
}
