import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (current.session.mfaVerified) redirect("/");
  if (!current.user.mfaConfirmedAt) redirect("/mfa/setup");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Enter your code</h1>
      <p className="mb-4 text-sm text-slate-500">Open your authenticator app and enter the 6-digit code for Ezly.</p>
      <MfaForm />
    </>
  );
}
