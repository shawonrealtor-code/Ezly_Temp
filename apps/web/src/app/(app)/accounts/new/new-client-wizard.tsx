"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { householdName, ratingReadiness } from "@ezly/core";
import { ApplicantSection, ContactSection, ErrorSummary, LeadSection, ReadinessPanel, type StaffOptions } from "@/components/client-fields";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { DuplicateMatch, FieldError } from "@/lib/accounts";
import { emptyClientForm, formReadinessView, type ClientForm } from "@/lib/client-form";
import { createAccountAction } from "../actions";

const STEPS = ["Applicant", "Contact & address", "Agency & lead", "Review & save"] as const;

/** Which step holds a field, so an error can send the user back to it. */
const stepOf = (field: string) => (field.startsWith("people") ? 0 : /^(address|previousAddress|phones|emails)/.test(field) ? 1 : field ? 2 : 3);

export function NewClientWizard({ staff, defaultProducerId, defaultCsrId }: { staff: StaffOptions; defaultProducerId: string; defaultCsrId: string }) {
  const [form, setForm] = useState<ClientForm>(() => emptyClientForm({ producerId: defaultProducerId, csrId: defaultCsrId }));
  const [step, setStep] = useState(0);
  const [warn, setWarn] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [pending, startTransition] = useTransition();

  const set = (update: (draft: ClientForm) => ClientForm) => setForm(update);
  const canSave = !!form.people[0].firstName.trim() && !!form.people[0].lastName.trim();
  const props = { form, set, errors, warn };

  const save = (allowDuplicate: boolean) =>
    startTransition(async () => {
      setWarn(true);
      const result = await createAccountAction(form, allowDuplicate);
      setErrors(result?.errors ?? []);
      setDuplicates(result?.duplicates ?? []);
      if (result?.errors?.length) setStep(stepOf(result.errors[0].field));
      if (result?.duplicates?.length) setStep(3);
    });

  const go = (to: number) => {
    setWarn(true);
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap items-center gap-y-2 rounded-[10px] border border-slate-200 bg-white px-[18px] py-3.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center">
            <button type="button" onClick={() => go(i)} className={`flex items-center gap-2.5 whitespace-nowrap font-semibold ${i === step ? "text-blue-700" : "text-slate-500"}`}>
              <span
                className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[13px] ${
                  i < step ? "border-blue-700 bg-blue-700 text-white" : i === step ? "border-blue-700 bg-white" : "border-slate-300 bg-white"
                }`}
              >
                {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={`mx-3.5 h-0.5 min-w-6 flex-1 ${i < step ? "bg-blue-700" : "bg-slate-200"}`} />}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ErrorSummary errors={errors.filter((e) => !e.field || stepOf(e.field) !== step || step === 3)} />
          <div className="rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)]">
            {step === 0 && <ApplicantSection {...props} />}
            {step === 1 && <ContactSection {...props} />}
            {step === 2 && <LeadSection {...props} staff={staff} />}
            {step === 3 && <Review form={form} staff={staff} duplicates={duplicates} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step > 0 && <button type="button" className={buttonClass()} onClick={() => go(step - 1)}>Back</button>}
            <Link href="/accounts" className={buttonClass("ghost")}>Cancel</Link>
            <div className="ml-auto flex gap-2">
              {step < STEPS.length - 1 && (
                <button type="button" className={buttonClass()} onClick={() => go(step + 1)}>
                  Next: {STEPS[step + 1]}
                </button>
              )}
              {duplicates.length > 0 ? (
                <button type="button" disabled={pending} className={buttonClass("danger")} onClick={() => save(true)}>
                  Save anyway
                </button>
              ) : (
                <button type="button" disabled={!canSave || pending} className={buttonClass("primary")} onClick={() => save(false)} title={canSave ? undefined : "Enter a first and last name first"}>
                  {pending ? "Saving…" : "Save client"}
                </button>
              )}
            </div>
          </div>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <ReadinessPanel form={form} />
          <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-[13px] leading-7">
            <b>Legend</b>
            <br />
            <span className="text-red-600">*</span> Required to save
            <br />
            <span className="mr-1 inline-block h-[7px] w-[7px] rounded-full bg-amber-500" /> Required before quoting carriers
            <br />
            You can save now and finish the rest later.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Review({ form, staff, duplicates }: { form: ClientForm; staff: StaffOptions; duplicates: DuplicateMatch[] }) {
  const missing = ratingReadiness(formReadinessView(form)).filter((i) => !i.done);
  const a = form.address;
  const name = (id: string, list: { id: string; name: string }[]) => list.find((u) => u.id === id)?.name ?? "Unassigned";
  const rows: [string, string][] = [
    ["Client", householdName(form.people.filter((p) => p.firstName && p.lastName)) || "—"],
    ["Date of birth", form.people[0].dateOfBirth || "—"],
    ["Address", a.line1 ? `${a.line1}${a.unit ? `, ${a.unit}` : ""}, ${a.city}, ${a.state} ${a.zip}` : "—"],
    ["Phone", form.phones.filter((p) => p.number).map((p) => p.number).join(", ") || "—"],
    ["Email", form.emails.filter((e) => e.address).map((e) => e.address).join(", ") || "—"],
    ["Producer / CSR", `${name(form.producerId, staff.producers)} / ${name(form.csrId, staff.csrs)}`],
    ["Lead source", form.leadSource || "—"],
  ];
  return (
    <div className="p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Review</h3>
      {duplicates.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <b>This may already be a client.</b> Open the existing record instead, or save anyway if it&apos;s a different person.
          <ul className="mt-2 flex flex-col gap-1">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/accounts/${d.id}`} target="_blank" className="font-semibold text-blue-700 hover:underline">{d.name}</Link>{" "}
                <span className="text-slate-600">— same {d.reasons.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-600">
        {missing.length === 0
          ? "Everything carriers need is filled in — this client is ready to quote."
          : `Still needed before quoting: ${missing.map((m) => m.label.toLowerCase()).join("; ")}. You can save now and add these later.`}
      </p>
    </div>
  );
}
