"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { mailConfigured, sendMail } from "@/lib/mail";
import { LOB_TITLES } from "@/lib/quote-forms";
import { proposalFor } from "./proposal-data";

export async function emailProposalAction(accountId: string, appId: string, runId: string, to: string, message: string) {
  const { user, data } = await requireUser("quotes:run");
  if (!z.email().safeParse(to.trim()).success) return { error: "Enter a valid email address." };
  if (!mailConfigured()) return { error: "Email isn't set up on this server yet." };
  const { pdf, fileName, run, clientName } = await proposalFor(data, user, accountId, appId, runId);
  try {
    await sendMail({
      to: to.trim(),
      replyTo: user.email,
      subject: `Your ${LOB_TITLES[run.lob].toLowerCase()} insurance quotes`,
      text: `${message.slice(0, 2000).trim()}\n\n${user.name}`,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });
  } catch {
    return { error: "The email couldn't be sent. Check the mail settings, or download the PDF and send it yourself." };
  }
  const now = new Date().toISOString();
  await data.quoteRuns.update(runId, { emailedAt: now });
  await data.activities.create({ accountId, kind: "email", body: `Emailed ${LOB_TITLES[run.lob].toLowerCase()} proposal to ${to.trim()} (${clientName}).`, occurredAt: now, authorId: user.id });
  revalidatePath(`/accounts/${accountId}`, "layout");
  return { ok: `Sent to ${to.trim()}.` };
}
