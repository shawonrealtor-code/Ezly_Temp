"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@ezly/auth/policy";
import { Field, SubmitButton } from "../../../(public)/form-parts";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember and hard to guess.`}
        required
      />
      <Field label="Repeat new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      {state?.problems && (
        <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-700">
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <SubmitButton pending={pending}>Save password</SubmitButton>
    </form>
  );
}
