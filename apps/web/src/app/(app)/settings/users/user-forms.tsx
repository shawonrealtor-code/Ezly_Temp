"use client";

import { useActionState } from "react";
import { ROLE_LABELS } from "@ezly/auth/permissions";
import { PASSWORD_MIN_LENGTH } from "@ezly/auth/policy";
import { createUserAction, setEmailDomainAction, userRowAction, type UserFormState } from "./actions";

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

export function EmailDomainForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(setEmailDomainAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor="emailDomain" className="font-medium">Company email domain</label>
      <span className="text-slate-500">@</span>
      <input id="emailDomain" name="emailDomain" defaultValue={current} placeholder="sahaagency.com" className={input} />
      <button disabled={pending} className={button}>Save</button>
      <Feedback state={state} />
    </form>
  );
}

export function UserRowActions(props: {
  self: boolean;
  userId: string;
  role: string;
  active: boolean;
  locked: boolean;
  hasMfa: boolean;
  mailbox?: string;
  suggestedMailbox: string;
}) {
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
      {props.self ? (
        <span className="text-slate-500">Another admin manages your role and sign-in</span>
      ) : (
        <>
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
              <input name="temporaryPassword" type="password" minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" aria-label="Temporary password" className={input} />
              {op("reset-password", "Save")}
            </div>
          </details>
        </>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-blue-700">{props.mailbox ? "Company email settings" : "Connect company email"}</summary>
        <div className="mt-1 flex flex-col gap-1">
          {props.mailbox ? (
            <div className="flex items-center gap-2 text-xs">
              <span>Sending from {props.mailbox}</span>
              {op("disconnect-mailbox", "Disconnect", "Disconnect this mailbox? Their emails will come from the shared company mailbox.")}
            </div>
          ) : (
            <>
              <input name="mailboxAddress" type="email" defaultValue={props.suggestedMailbox.startsWith("@") ? "" : props.suggestedMailbox} placeholder={`name${props.suggestedMailbox.startsWith("@") ? props.suggestedMailbox : "@company.com"}`} aria-label="Company email address" className={input} />
              <input name="mailboxPassword" type="password" autoComplete="off" placeholder="Mailbox password (same as webmail)" aria-label="Mailbox password" className={input} />
              <div>{op("connect-mailbox", "Connect & test")}</div>
              <p className="text-xs text-slate-500">Stored encrypted. Ezly signs in to check it works; nothing is sent.</p>
            </>
          )}
        </div>
      </details>
      <Feedback state={state} />
    </form>
  );
}
