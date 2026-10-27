"use client";

import { useState, useTransition } from "react";
import { ApplicantSection, ContactSection, ErrorSummary, LeadSection, ReadinessPanel, type StaffOptions } from "@/components/client-fields";
import { buttonClass } from "@/components/ui";
import type { FieldError } from "@/lib/accounts";
import type { ClientForm } from "@/lib/client-form";
import { revealAction, updateAccountAction, updateLeadAction } from "../../actions";

/** Edit form for the Details tab (applicant + contact) and the Lead info tab. */
export function ClientEditor({
  accountId, initial, mode, staff, canEdit, canReveal,
}: { accountId: string; initial: ClientForm; mode: "details" | "lead"; staff: StaffOptions; canEdit: boolean; canReveal: boolean }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [saved, setSaved] = useState(false);
  const [revealed, setRevealed] = useState<{ label: string; value: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = (update: (draft: ClientForm) => ClientForm) => {
    setSaved(false);
    setForm(update);
  };

  const save = () =>
    startTransition(async () => {
      const result = mode === "details" ? await updateAccountAction(accountId, form) : await updateLeadAction(accountId, form);
      setErrors(result?.errors ?? []);
      if (result?.saved) {
        setSaved(true);
        // Clear typed SSN / license numbers: they're saved (encrypted) and shouldn't linger in the page.
        setForm((f) => ({ ...f, people: f.people.map((p) => ({ ...p, ssn: "", dlNumber: "" })) }));
      }
    });

  const reveal = canReveal
    ? (index: number, field: "ssn" | "dlNumber") => {
        const person = form.people[index];
        if (!person.id) return;
        const reason = window.prompt("Why do you need to see this? Your reason is recorded in the activity log.");
        if (!reason) return;
        startTransition(async () => {
          const result = await revealAction(accountId, person.id!, field, reason);
          if ("value" in result && result.value) {
            setRevealed({ label: `${field === "ssn" ? "SSN" : "Driver's license"} for ${person.firstName} ${person.lastName}`, value: result.value });
            setTimeout(() => setRevealed(null), 30_000);
          } else setErrors([{ field: "", message: result.error ?? "Couldn't reveal." }]);
        });
      }
    : undefined;

  const props = { form, set, errors, warn: true, onReveal: reveal };
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_280px]">
      <div className="flex min-w-0 flex-col gap-4">
        {revealed && (
          <div role="status" className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <span>{revealed.label}: <b className="font-mono">{revealed.value}</b></span>
            <span className="text-xs text-slate-500">Hides in 30 seconds. This view was logged.</span>
            <button type="button" className="ml-auto text-blue-700" onClick={() => setRevealed(null)}>Hide</button>
          </div>
        )}
        <ErrorSummary errors={errors} />
        <fieldset disabled={!canEdit || pending} className="min-w-0 rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)]">
          {mode === "details" ? (
            <>
              <ApplicantSection {...props} />
              <ContactSection {...props} />
            </>
          ) : (
            <LeadSection {...props} staff={staff} />
          )}
        </fieldset>
        {canEdit && (
          <div className="sticky bottom-0 flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white/95 p-3 backdrop-blur">
            <button type="button" className={buttonClass("primary")} disabled={!dirty || pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            {dirty && <button type="button" className={buttonClass("ghost")} onClick={() => { setForm(initial); setErrors([]); }}>Discard changes</button>}
            {saved && !dirty && <span role="status" className="text-sm text-emerald-700">Saved.</span>}
            {!canEdit && <span className="text-sm text-slate-500">Read-only access</span>}
          </div>
        )}
      </div>
      {mode === "details" && <aside className="xl:sticky xl:top-4"><ReadinessPanel form={form} /></aside>}
    </div>
  );
}
