"use client";

import { useActionState } from "react";
import { signInAction, type FormState } from "../actions";
import { ErrorMessage, Field, SubmitButton } from "../form-parts";

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <ErrorMessage message={state?.error} />
      <SubmitButton pending={pending}>Continue</SubmitButton>
    </form>
  );
}
