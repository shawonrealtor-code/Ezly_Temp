import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

const NOTICES: Record<string, string> = {
  mfa: "Your sign-in attempt ended. Please sign in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const current = await getCurrentSession();
  if (current?.session.mfaVerified) redirect("/");
  const { reason } = await searchParams;
  const notice = typeof reason === "string" ? NOTICES[reason] : undefined;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
      <p className="mb-4 text-sm text-slate-500">Staff access only. All activity is logged.</p>
      {notice && <p className="mb-4 rounded bg-amber-50 p-2 text-sm text-amber-800">{notice}</p>}
      <SignInForm />
    </>
  );
}
