"use server";

import { revalidatePath } from "next/cache";
import { ROLES, StoreError, type User } from "@ezly/store";
import { getAuth, getRequestMeta, requireUser } from "@/lib/auth";

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
