"use client";

import { useActionState } from "react";
import { ROLE_LABELS } from "@ezly/auth/permissions";
import { PASSWORD_MIN_LENGTH } from "@ezly/auth/policy";
import { createUserAction, userRowAction, type UserFormState } from "./actions";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const button = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";

function Feedback({ state }: { state: UserFormState }) {
  if (!state) return null;
  if (state.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return (
    <ul role="alert" className="text-sm text-red-700">
      {state.problems?.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

function RoleSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="role" defaultValue={defaultValue ?? "CSR"} className={input}>
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, null);
  return (
    <form action={action} className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 font-semibold">Add a user</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <input name="name" placeholder="Full name" required className={input} />
        <input name="email" type="email" placeholder="Email" required className={input} />
        <RoleSelect />
        <input
          name="temporaryPassword"
          type="password"
          placeholder={`Temporary password (${PASSWORD_MIN_LENGTH}+ chars)`}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
          className={input}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        They must choose their own password and set up two-step sign-in the first time they sign in.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          Add user
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function UserRowActions(props: { userId: string; role: string; active: boolean; locked: boolean; hasMfa: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(userRowAction, null);
  const op = (name: string, label: string, confirmText?: string) => (
    <button
      name="op"
      value={name}
      disabled={pending}
      className={button}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={props.userId} />
      <div className="flex flex-wrap gap-1">
        <RoleSelect defaultValue={props.role} />
        {op("role", "Change role")}
      </div>
      <div className="flex flex-wrap gap-1">
        {props.active ? op("disable", "Disable", "Disable this user? They are signed out immediately.") : op("enable", "Enable")}
        {props.locked && op("unlock", "Unlock")}
        {props.hasMfa && op("reset-mfa", "Reset two-step", "Reset two-step sign-in? They must set it up again at next sign-in.")}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-blue-700">Set a temporary password</summary>
        <div className="mt-1 flex gap-1">
          <input name="temporaryPassword" type="password" minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={input} />
          {op("reset-password", "Save")}
        </div>
      </details>
      <Feedback state={state} />
    </form>
  );
}
