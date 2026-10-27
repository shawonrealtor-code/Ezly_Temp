import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        {...input}
        className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      disabled={pending}
      className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
