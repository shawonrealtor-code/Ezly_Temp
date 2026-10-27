"use server";

import { redirect } from "next/navigation";
import { getAuth, getRequestMeta, limits, requireUser, setSessionCookie } from "@/lib/auth";

export type PasswordState = { problems: string[] } | null;

export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const { user, session } = await requireUser(undefined, { allowPasswordChange: true });
  const meta = await getRequestMeta();
  if (!limits.passwordChange.hit(user.id).allowed) return { problems: ["Too many attempts. Try again later."] };
  const next = String(form.get("newPassword") ?? "");
  if (next !== String(form.get("confirmPassword") ?? "")) return { problems: ["The new passwords don't match."] };
  const result = await getAuth().changePassword({ user, session }, String(form.get("currentPassword") ?? ""), next, meta);
  if (!result.ok) return { problems: result.problems };
  await setSessionCookie(result.token, true);
  redirect("/?password=changed");
}
