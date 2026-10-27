"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  getAuth,
  getCurrentSession,
  getRequestMeta,
  holdRecoveryCodes,
  limits,
  sessionToken,
  setSessionCookie,
} from "@/lib/auth";

export type FormState = { error?: string } | null;

const TOO_MANY = "Too many attempts. Wait a minute and try again.";

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const meta = await getRequestMeta();
  if (!limits.signIn.hit(meta.ip).allowed) return { error: TOO_MANY };
  const result = await getAuth().signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""), meta);
  if (!result.ok) {
    return {
      error:
        result.reason === "locked"
          ? "This account is temporarily locked after too many failed attempts. Try again later or ask an admin."
          : "Email or password is incorrect.",
    };
  }
  await setSessionCookie(result.token, false);
  redirect(result.next === "mfa" ? "/mfa" : "/mfa/setup");
}

export async function verifyMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const meta = await getRequestMeta();
  if (!limits.mfa.hit(meta.ip).allowed) return { error: TOO_MANY };
  const token = (await sessionToken()) ?? "";
  const code = String(form.get("code") ?? "");
  const result =
    form.get("mode") === "recovery"
      ? await getAuth().useRecoveryCode(token, code, meta)
      : await getAuth().verifyMfa(token, code, meta);
  if (!result.ok) {
    if (result.reason === "invalid") return { error: "That code didn't work. Check your authenticator app and try again." };
    await clearSessionCookie();
    redirect("/login?reason=mfa");
  }
  await setSessionCookie(result.token, true);
  redirect(result.mustChangePassword ? "/account/password" : "/");
}

export async function confirmMfaSetupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const meta = await getRequestMeta();
  if (!limits.mfa.hit(meta.ip).allowed) return { error: TOO_MANY };
  const pending = await getCurrentSession();
  const result = await getAuth().confirmMfaEnrollment((await sessionToken()) ?? "", String(form.get("code") ?? ""), meta);
  if (!result.ok) {
    if (result.reason === "invalid") return { error: "That code didn't work. Make sure your phone's time is correct and try the newest code." };
    await clearSessionCookie();
    redirect("/login?reason=mfa");
  }
  await setSessionCookie(result.token, true);
  if (pending && result.recoveryCodes) holdRecoveryCodes(pending.user.id, result.recoveryCodes);
  redirect("/mfa/recovery-codes");
}

export async function signOutAction(): Promise<void> {
  await getAuth().signOut(await sessionToken(), await getRequestMeta());
  await clearSessionCookie();
  redirect("/login");
}
