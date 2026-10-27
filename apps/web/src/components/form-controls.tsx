"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

// Labeled inputs matching the mockups. `need` marks fields required to save (red *) or to rate (amber dot).

export type Need = "save" | "rate";

const control =
  "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

function Label({ label, need, htmlFor }: { label: string; need?: Need; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-700">
      {label}
      {need === "save" && <span className="text-red-600"> *</span>}
      {need === "rate" && <span title="Needed before quoting" className="ml-1 inline-block h-[7px] w-[7px] rounded-full bg-amber-500 align-middle" />}
    </label>
  );
}

function Hint({ error, warn, hint }: { error?: string; warn?: boolean; hint?: ReactNode }) {
  if (error) return <span className="text-xs text-red-600">{error}</span>;
  if (warn) return <span className="text-xs text-amber-700">Needed to rate</span>;
  return hint ? <span className="text-xs text-slate-500">{hint}</span> : null;
}

const border = (error?: string, warn?: boolean) =>
  error ? "border-red-300 ring-2 ring-red-100" : warn ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-300";

interface Common {
  id: string;
  label: string;
  need?: Need;
  error?: string;
  /** Show the "needed to rate" highlight (only after the user has tried to continue). */
  warn?: boolean;
  hint?: ReactNode;
  className?: string;
}

export function TextField({ id, label, need, error, warn, hint, className = "", onValue, ...input }: Common & { onValue: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange">) {
  const showWarn = warn && need === "rate" && !String(input.value ?? "").trim();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label label={label} need={need} htmlFor={id} />
      <input id={id} name={id} className={`${control} ${border(error, showWarn)}`} onChange={(e) => onValue(e.target.value)} {...input} />
      <Hint error={error} warn={showWarn} hint={hint} />
    </div>
  );
}

export function SelectField({
  id, label, need, error, warn, hint, className = "", options, placeholder = "Select…", onValue, ...select
}: Common & { options: readonly (string | readonly [string, string])[]; placeholder?: string; onValue: (v: string) => void } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "onChange">) {
  const showWarn = warn && need === "rate" && !String(select.value ?? "").trim();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label label={label} need={need} htmlFor={id} />
      <select id={id} name={id} className={`${control} ${border(error, showWarn)}`} onChange={(e) => onValue(e.target.value)} {...select}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const [value, text] = typeof o === "string" ? [o, o] : o;
          return <option key={value} value={value}>{text}</option>;
        })}
      </select>
      <Hint error={error} warn={showWarn} hint={hint} />
    </div>
  );
}

export function Segmented({ id, label, value, options, onValue }: { id: string; label: string; value: string; options: readonly (readonly [string, string])[]; onValue: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-slate-700">{label}</legend>
      <div className="flex gap-2" id={id}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onValue(value === v ? "" : v)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${value === v ? "border-blue-600 bg-blue-50 font-semibold text-blue-700" : "border-slate-300 bg-white"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({ id, label, checked, onValue }: { id: string; label: string; checked: boolean; onValue: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-sm">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onValue(e.target.checked)} />
      <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
      {label}
    </label>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-200 p-5 last:border-b-0">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mb-4 mt-0.5 text-[13px] text-slate-500">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

export const grid4 = "grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2 lg:grid-cols-4";
