import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function PasswordPage() {
  const { user } = await requireUser(undefined, { allowPasswordChange: true });
  return (
    <div className="mx-auto max-w-md rounded-lg border bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold">{user.mustChangePassword ? "Choose your own password" : "Change password"}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {user.mustChangePassword
          ? "You signed in with a temporary password. Choose a new one to continue."
          : "Changing your password signs you out on all other devices."}
      </p>
      <PasswordForm />
    </div>
  );
}
