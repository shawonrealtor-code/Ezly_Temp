import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession, takeRecoveryCodes } from "@/lib/auth";

export default async function RecoveryCodesPage() {
  const current = await getCurrentSession();
  if (!current?.session.mfaVerified) redirect("/login");
  const codes = takeRecoveryCodes(current.user.id);
  if (!codes) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Save your recovery codes</h1>
      <p className="mb-4 text-sm text-slate-600">
        Two-step sign-in is on. If you lose your phone, each code below lets you sign in once. Store them somewhere
        safe, such as a password manager or a printed copy in a locked drawer. <b>They won&apos;t be shown again.</b>
      </p>
      <ul className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Link href="/" className="block rounded-md bg-blue-700 px-4 py-2 text-center font-semibold text-white hover:bg-blue-800">
        I&apos;ve saved them — continue
      </Link>
    </>
  );
}
