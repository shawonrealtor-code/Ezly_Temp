"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES, StoreError, type User } from "@ezly/store";
import { getAuth, getRequestMeta, requireUser } from "@/lib/auth";
import { domainOf, verifyMailbox } from "@/lib/mail";
import { getStore } from "@/lib/store";

export type UserFormState = { ok?: string; problems?: string[] } | null;

function parseRole(value: FormDataEntryValue | null): User["role"] | null {
  return ROLES.includes(value as User["role"]) ? (value as User["role"]) : null;
}

export async function createUserAction(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const { user: admin } = await requireUser("users:manage");
  const role = parseRole(form.get("role"));
  if (!role) return { problems: ["Choose a role."] };
  try {
    const result = await getAuth().createUser(admin.agencyId, admin.id, {
      email: String(form.get("email") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      role,
      temporaryPassword: String(form.get("temporaryPassword") ?? ""),
    });
    if (!result.ok) return { problems: result.problems };
    revalidatePath("/settings/users");
    return { ok: `Added ${result.user.name}. Give them the temporary password in person or by phone, not by email.` };
  } catch (err) {
    if (err instanceof StoreError && err.code === "VALIDATION") {
      return { problems: [err.message.includes("email") ? "Someone already uses that email." : "Check the name and email."] };
    }
    throw err;
  }
}

export async function userRowAction(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const { user: admin } = await requireUser("users:manage");
  const auth = getAuth();
  const meta = await getRequestMeta();
  const userId = String(form.get("userId") ?? "");
  try {
    switch (form.get("op")) {
      case "disable":
        await auth.setActive(admin.agencyId, admin.id, userId, false);
        break;
      case "enable":
        await auth.setActive(admin.agencyId, admin.id, userId, true);
        break;
      case "role": {
        const role = parseRole(form.get("role"));
        if (!role) return { problems: ["Choose a role."] };
        await auth.setRole(admin.agencyId, admin.id, userId, role);
        break;
      }
      case "reset-mfa":
        await auth.resetMfa(admin.agencyId, admin.id, userId, meta);
        break;
      case "unlock":
        await auth.unlock(admin.agencyId, admin.id, userId, meta);
        break;
      case "connect-mailbox": {
        const agency = await getStore().agencies.get(admin.agencyId);
        if (!agency?.emailDomain) return { problems: ["Set the company email domain first (top of this page)."] };
        const address = String(form.get("mailboxAddress") ?? "").trim().toLowerCase();
        const password = String(form.get("mailboxPassword") ?? "");
        if (!z.email().safeParse(address).success) return { problems: ["Enter the company email address."] };
        if (domainOf(address) !== agency.emailDomain) return { problems: [`Use a company address ending in @${agency.emailDomain}.`] };
        if (!password) return { problems: ["Enter the mailbox password."] };
        const check = await verifyMailbox(address, password);
        if ("error" in check) return { problems: [check.error] };
        await getStore().forAgency(admin.agencyId, admin.id).users.update(userId, {
          mailboxAddress: address,
          mailboxPassword: getStore().cipher.encrypt(password),
          mailboxVerifiedAt: new Date().toISOString(),
        });
        revalidatePath("/settings/users");
        return { ok: `Connected ${address}. Emails this person sends from Ezly now come from it.` };
      }
      case "disconnect-mailbox":
        await getStore().forAgency(admin.agencyId, admin.id).users.update(userId, { mailboxAddress: undefined, mailboxPassword: undefined, mailboxVerifiedAt: undefined });
        break;
      case "reset-password": {
        const result = await auth.resetPassword(admin.agencyId, admin.id, userId, String(form.get("temporaryPassword") ?? ""));
        if (!result.ok) return { problems: result.problems };
        break;
      }
      default:
        return { problems: ["Unknown action."] };
    }
  } catch (err) {
    return { problems: [err instanceof Error ? err.message : "Something went wrong."] };
  }
  revalidatePath("/settings/users");
  return { ok: "Saved." };
}

export async function setEmailDomainAction(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const { user: admin } = await requireUser("users:manage");
  const domain = String(form.get("emailDomain") ?? "").trim().toLowerCase().replace(/^@/, "");
  try {
    await getStore().agencies.update(admin.agencyId, { emailDomain: domain || undefined }, { actorId: admin.id });
  } catch (err) {
    if (err instanceof StoreError) return { problems: ["Enter a domain like sahaagency.com."] };
    throw err;
  }
  revalidatePath("/settings/users");
  return { ok: domain ? `Company email domain set to ${domain}.` : "Company email domain cleared." };
}
