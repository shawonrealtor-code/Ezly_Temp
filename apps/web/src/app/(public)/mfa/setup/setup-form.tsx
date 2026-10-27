"use client";

import { useActionState } from "react";
import { confirmMfaSetupAction, type FormState } from "../../actions";
import { ErrorMessage, Field, SubmitButton } from "../../form-parts";

export function SetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmMfaSetupAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
      <ErrorMessage message={state?.error} />
      <SubmitButton pending={pending}>Turn on two-step sign-in</SubmitButton>
    </form>
  );
}
