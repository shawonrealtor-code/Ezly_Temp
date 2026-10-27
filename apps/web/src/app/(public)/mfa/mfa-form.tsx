"use client";

import { useActionState, useState } from "react";
import { verifyMfaAction, type FormState } from "../actions";
import { ErrorMessage, Field, SubmitButton } from "../form-parts";

export function MfaForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyMfaAction, null);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={recovery ? "recovery" : "totp"} />
      {recovery ? (
        <Field key="recovery" label="Recovery code" name="code" autoComplete="off" placeholder="abcde-fghjk" required autoFocus />
      ) : (
        <Field
          key="totp"
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
        />
      )}
      <ErrorMessage message={state?.error} />
      <SubmitButton pending={pending}>Verify</SubmitButton>
      <button type="button" onClick={() => setRecovery(!recovery)} className="text-sm text-blue-700 hover:underline">
        {recovery ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
      </button>
    </form>
  );
}
