import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getAuth, getCurrentSession } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export default async function MfaSetupPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (current.session.mfaVerified) redirect("/");
  if (current.user.mfaConfirmedAt) redirect("/mfa");

  const { secret, uri } = await getAuth().startMfaEnrollment(current);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Set up two-step sign-in</h1>
      <p className="mb-4 text-sm text-slate-500">
        Ezly requires a code from an authenticator app each time you sign in. Use any free app, such as Google
        Authenticator or Microsoft Authenticator.
      </p>
      <ol className="mb-4 list-decimal space-y-3 pl-5 text-sm">
        <li>
          In the app, add an account and scan this code:
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated on the server */}
          <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mt-2 rounded border" />
          <details className="mt-2 text-slate-500">
            <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
            <code className="mt-1 block break-all rounded bg-slate-100 p-2 font-mono text-xs text-slate-800">
              {secret.match(/.{1,4}/g)?.join(" ")}
            </code>
          </details>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <SetupForm />
    </>
  );
}
