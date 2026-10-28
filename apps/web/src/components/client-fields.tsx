"use client";

import { ratingReadiness } from "@ezly/core";
import { Icon } from "./icons";
import { FormSection, SelectField, Segmented, TextField, Toggle, grid4 } from "./form-controls";
import { OPTIONS, emptyPerson, formReadinessView, type AddressForm, type ClientForm, type PersonForm } from "@/lib/client-form";
import type { FieldError } from "@/lib/accounts";

// The client form sections. Shared by the new-client steps and the Details / Lead info tabs.

export interface SectionProps {
  form: ClientForm;
  set: (update: (draft: ClientForm) => ClientForm) => void;
  errors: FieldError[];
  /** Highlight empty "needed to rate" fields. */
  warn: boolean;
  /** Admin only: show reveal buttons for saved SSN / license numbers. */
  onReveal?: (personIndex: number, field: "ssn" | "dlNumber") => void;
}

const errorFor = (errors: FieldError[], field: string) => errors.find((e) => e.field === field)?.message;
const STATE_CODES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function PersonFields({ person, index, props }: { person: PersonForm; index: number; props: SectionProps }) {
  const { set, errors, warn } = props;
  const primary = index === 0;
  const id = (name: string) => `p${index}-${name}`;
  const update = (patch: Partial<PersonForm>) =>
    set((f) => ({ ...f, people: f.people.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  const err = (name: string) => errorFor(errors, `people.${index}.${name}`);
  const rate = primary ? ("rate" as const) : undefined;
  return (
    <div className={grid4}>
      <SelectField id={id("prefix")} label="Prefix" value={person.prefix} options={OPTIONS.prefix} onValue={(prefix) => update({ prefix })} />
      <TextField id={id("firstName")} label="First name" need="save" value={person.firstName} error={err("firstName")} autoComplete="off" onValue={(firstName) => update({ firstName })} />
      <TextField id={id("middleInitial")} label="Middle initial" value={person.middleInitial} maxLength={1} onValue={(middleInitial) => update({ middleInitial })} />
      <TextField id={id("lastName")} label="Last name" need="save" value={person.lastName} error={err("lastName")} autoComplete="off" onValue={(lastName) => update({ lastName })} />
      <SelectField id={id("suffix")} label="Suffix" value={person.suffix} options={OPTIONS.suffix} onValue={(suffix) => update({ suffix })} />
      <TextField id={id("dateOfBirth")} label="Date of birth" type="date" need={rate} warn={warn} value={person.dateOfBirth} error={err("dateOfBirth")} onValue={(dateOfBirth) => update({ dateOfBirth })} />
      <SelectField id={id("gender")} label="Gender" need={rate} warn={warn} value={person.gender} options={OPTIONS.gender} onValue={(gender) => update({ gender })} />
      <SelectField id={id("maritalStatus")} label="Marital status" need={rate} warn={warn} value={person.maritalStatus} options={OPTIONS.maritalStatus} onValue={(maritalStatus) => update({ maritalStatus })} />
      <TextField
        id={id("ssn")}
        label="SSN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        placeholder={person.ssnLast4 ? `On file: ***-**-${person.ssnLast4}` : "Optional"}
        value={person.ssn}
        error={err("ssn")}
        hint={
          person.ssnLast4 && props.onReveal ? (
            <button type="button" className="text-blue-700 hover:underline" onClick={() => props.onReveal?.(index, "ssn")}>Reveal (logged)</button>
          ) : person.ssnLast4 ? "Type a new one to replace it" : "Stored encrypted"
        }
        onValue={(ssn) => update({ ssn })}
      />
      <SelectField id={id("dlStatus")} label="License status" need={rate} warn={warn} value={person.dlStatus} options={OPTIONS.dlStatus} onValue={(dlStatus) => update({ dlStatus })} />
      <TextField
        id={id("dlNumber")}
        label="Driver's license #"
        type="password"
        autoComplete="off"
        placeholder={person.hasDlNumber ? "On file (hidden)" : "Optional"}
        value={person.dlNumber}
        hint={
          person.hasDlNumber && props.onReveal ? (
            <button type="button" className="text-blue-700 hover:underline" onClick={() => props.onReveal?.(index, "dlNumber")}>Reveal (logged)</button>
          ) : "Stored encrypted"
        }
        onValue={(dlNumber) => update({ dlNumber })}
      />
      <SelectField id={id("dlState")} label="License state" value={person.dlState} options={STATE_CODES} error={err("dlState")} onValue={(dlState) => update({ dlState })} />
      {primary && (
        <>
          <SelectField id={id("industry")} label="Industry" need="rate" warn={warn} value={person.industry} options={OPTIONS.industry} onValue={(industry) => update({ industry })} />
          <TextField id={id("occupation")} label="Occupation" need="rate" warn={warn} value={person.occupation} onValue={(occupation) => update({ occupation })} />
          <SelectField id={id("education")} label="Education" value={person.education} options={OPTIONS.education} onValue={(education) => update({ education })} />
          <SelectField id={id("preferredLanguage")} label="Preferred language" value={person.preferredLanguage} placeholder="English" options={OPTIONS.language} onValue={(preferredLanguage) => update({ preferredLanguage })} />
        </>
      )}
    </div>
  );
}

export function ApplicantSection(props: SectionProps) {
  const { form, set } = props;
  return (
    <>
      <FormSection title="Applicant" description="Only first and last name are needed to save. Fields with an orange dot are needed before quoting.">
        <PersonFields person={form.people[0]} index={0} props={props} />
      </FormSection>
      {form.people.slice(1).map((p, i) => (
        <FormSection key={p.id ?? `new-${i}`} title="Co-applicant / spouse">
          <PersonFields person={p} index={i + 1} props={props} />
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-red-700 hover:underline"
            onClick={() => set((f) => ({ ...f, people: f.people.filter((_, j) => j !== i + 1) }))}
          >
            Remove co-applicant
          </button>
        </FormSection>
      ))}
      {form.people.length < 2 && (
        <div className="px-5 pb-5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
            onClick={() => set((f) => ({ ...f, people: [...f.people, { ...emptyPerson("spouse"), lastName: f.people[0].lastName }] }))}
          >
            <Icon name="plus" className="h-4 w-4" /> Add co-applicant / spouse
          </button>
        </div>
      )}
    </>
  );
}

function AddressFields({ which, props }: { which: "address" | "previousAddress"; props: SectionProps }) {
  const { form, set, errors, warn } = props;
  const a = form[which];
  const primary = which === "address";
  const update = (patch: Partial<AddressForm>) => set((f) => ({ ...f, [which]: { ...f[which], ...patch } }));
  const id = (n: string) => `${which}-${n}`;
  const err = (n: string) => errorFor(errors, `${which}.${n}`);
  const rate = primary ? ("rate" as const) : undefined;
  return (
    <div className={grid4}>
      <TextField id={id("line1")} className="sm:col-span-2 lg:col-span-3" label="Street address" need={rate} warn={warn} value={a.line1} error={err("line1")} autoComplete="off" onValue={(line1) => update({ line1 })} />
      <TextField id={id("unit")} label="Unit" placeholder="Apt, suite…" value={a.unit} onValue={(unit) => update({ unit })} />
      <TextField id={id("city")} label="City" need={rate} warn={warn} value={a.city} onValue={(city) => update({ city })} />
      <TextField id={id("county")} label="County" need={rate} warn={warn} value={a.county} onValue={(county) => update({ county })} />
      <SelectField id={id("state")} label="State" need={rate} warn={warn} value={a.state} options={STATE_CODES} onValue={(state) => update({ state })} />
      <TextField id={id("zip")} label="ZIP" need={rate} warn={warn} inputMode="numeric" maxLength={10} value={a.zip} onValue={(zip) => update({ zip })} />
      <TextField id={id("yearsAt")} label="Years at address" need={rate} warn={warn} type="number" min={0} max={100} value={a.yearsAt} error={err("yearsAt")} onValue={(yearsAt) => update({ yearsAt })} />
      <TextField id={id("monthsAt")} label="Months at address" type="number" min={0} max={11} value={a.monthsAt} error={err("monthsAt")} onValue={(monthsAt) => update({ monthsAt })} />
    </div>
  );
}

export function ContactSection(props: SectionProps) {
  const { form, set, errors } = props;
  const years = form.address.yearsAt === "" ? undefined : Number(form.address.yearsAt);
  const showPrevious = (years !== undefined && years < 3) || !!form.previousAddress.line1;
  const setList = <K extends "phones" | "emails">(key: K, list: ClientForm[K]) => set((f) => ({ ...f, [key]: list }));
  return (
    <>
      <FormSection title="Primary address" description="Where the client lives. A previous address is needed if they've lived here under 3 years.">
        <AddressFields which="address" props={props} />
      </FormSection>
      {showPrevious && (
        <FormSection title="Previous address">
          <AddressFields which="previousAddress" props={props} />
        </FormSection>
      )}
      <FormSection title="Phone & email" description="The preferred one is used for reminders.">
        <div className="flex flex-col gap-3">
          {form.phones.map((p, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr_auto_auto] items-end gap-2">
              <SelectField id={`phone-kind-${i}`} label="Type" placeholder="Type" value={p.kind} options={OPTIONS.phoneKind} onValue={(kind) => setList("phones", form.phones.map((x, j) => (j === i ? { ...x, kind } : x)))} />
              <TextField id={`phone-${i}`} label="Phone number" need={i === 0 ? "rate" : undefined} warn={props.warn && i === 0} type="tel" value={p.number} error={errorFor(errors, `phones.${i}.number`)} onValue={(number) => setList("phones", form.phones.map((x, j) => (j === i ? { ...x, number } : x)))} />
              <label className="mb-2.5 flex items-center gap-1 text-xs text-slate-600">
                <input type="radio" name="preferred-phone" checked={p.preferred} onChange={() => setList("phones", form.phones.map((x, j) => ({ ...x, preferred: j === i })))} /> Preferred
              </label>
              <button type="button" aria-label="Remove phone" className="mb-2 px-1 text-slate-400 hover:text-red-600" onClick={() => setList("phones", form.phones.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {form.phones.length < 5 && (
            <button type="button" className="self-start text-sm font-semibold text-blue-700" onClick={() => setList("phones", [...form.phones, { kind: "mobile", number: "", preferred: form.phones.length === 0 }])}>+ Add phone</button>
          )}
          {form.emails.map((e, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr_auto_auto] items-end gap-2">
              <SelectField id={`email-kind-${i}`} label="Type" placeholder="Type" value={e.kind} options={OPTIONS.emailKind} onValue={(kind) => setList("emails", form.emails.map((x, j) => (j === i ? { ...x, kind } : x)))} />
              <TextField id={`email-${i}`} label="Email" type="email" value={e.address} error={errorFor(errors, `emails.${i}.address`)} onValue={(address) => setList("emails", form.emails.map((x, j) => (j === i ? { ...x, address } : x)))} />
              <label className="mb-2.5 flex items-center gap-1 text-xs text-slate-600">
                <input type="radio" name="preferred-email" checked={e.preferred} onChange={() => setList("emails", form.emails.map((x, j) => ({ ...x, preferred: j === i })))} /> Preferred
              </label>
              <button type="button" aria-label="Remove email" className="mb-2 px-1 text-slate-400 hover:text-red-600" onClick={() => setList("emails", form.emails.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {form.emails.length < 5 && (
            <button type="button" className="self-start text-sm font-semibold text-blue-700" onClick={() => setList("emails", [...form.emails, { kind: "primary", address: "", preferred: form.emails.length === 0 }])}>+ Add email</button>
          )}
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Segmented id="preferredContact" label="Preferred contact method" value={form.preferredContact} options={[["text", "Text"], ["call", "Call"], ["email", "Email"]]} onValue={(preferredContact) => set((f) => ({ ...f, preferredContact }))} />
          <TextField id="contactTime" label="Best time to reach" placeholder="e.g. weekday evenings" value={form.contactTime} onValue={(contactTime) => set((f) => ({ ...f, contactTime }))} />
          <Toggle id="shareEmailWithCarriers" label="Share email with carriers when rating" checked={form.shareEmailWithCarriers} onValue={(shareEmailWithCarriers) => set((f) => ({ ...f, shareEmailWithCarriers }))} />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Toggle id="textConsent" label="Client agreed to receive texts from the agency" checked={form.textConsent} onValue={(textConsent) => set((f) => ({ ...f, textConsent }))} />
            <span className="text-xs text-slate-500">Required by law before the agency texts a client. Turning it off records that they opted out.</span>
          </div>
          {form.textConsent && (
            <SelectField id="textConsentMethod" label="How they agreed" value={form.textConsentMethod} error={errorFor(errors, "textConsentMethod")} options={OPTIONS.textConsentMethod} onValue={(textConsentMethod) => set((f) => ({ ...f, textConsentMethod }))} />
          )}
        </div>
      </FormSection>
    </>
  );
}

export interface StaffOptions {
  producers: { id: string; name: string }[];
  csrs: { id: string; name: string }[];
}

export function LeadSection({ staff, ...props }: SectionProps & { staff: StaffOptions }) {
  const { form, set, errors } = props;
  const update = (patch: Partial<ClientForm>) => set((f) => ({ ...f, ...patch }));
  return (
    <FormSection title="Agency & lead" description="Who handles this client and where they came from.">
      <div className={grid4}>
        <SelectField id="producerId" label="Producer" placeholder="Unassigned" value={form.producerId} error={errorFor(errors, "producerId")} options={staff.producers.map((u) => [u.id, u.name] as const)} onValue={(producerId) => update({ producerId })} />
        <SelectField id="csrId" label="CSR" placeholder="Unassigned" value={form.csrId} error={errorFor(errors, "csrId")} options={staff.csrs.map((u) => [u.id, u.name] as const)} onValue={(csrId) => update({ csrId })} />
        <SelectField id="leadSource" label="Lead source" value={form.leadSource} options={OPTIONS.leadSource} onValue={(leadSource) => update({ leadSource })} />
        <SelectField
          id="leadStatus"
          label="Status"
          placeholder="New lead"
          value={form.leadStatus === "NEW" ? "" : form.leadStatus}
          options={[["CONTACTED", "Contacted"], ["QUOTED", "Quoted"], ["SOLD", "Customer"], ["LOST", "Lost"]]}
          onValue={(leadStatus) => update({ leadStatus: leadStatus || "NEW" })}
        />
        <SelectField id="leadPriority" label="Priority" value={form.leadPriority} options={[["low", "Low"], ["normal", "Normal"], ["high", "High"]]} onValue={(leadPriority) => update({ leadPriority })} />
        <TextField id="probabilityOfSale" label="Probability of sale (%)" type="number" min={0} max={100} value={form.probabilityOfSale} error={errorFor(errors, "probabilityOfSale")} onValue={(probabilityOfSale) => update({ probabilityOfSale })} />
        <TextField id="customerSince" label="Customer since" type="date" value={form.customerSince} error={errorFor(errors, "customerSince")} onValue={(customerSince) => update({ customerSince })} />
        <TextField id="labels" label="Labels" placeholder="e.g. bundle, referral partner" hint="Separate with commas" value={form.labels} onValue={(labels) => update({ labels })} />
      </div>
      <div className="mt-4">
        <Toggle id="vip" label="VIP client" checked={form.vip} onValue={(vip) => update({ vip })} />
      </div>
    </FormSection>
  );
}

export function ReadinessPanel({ form }: { form: ClientForm }) {
  const items = ratingReadiness(formReadinessView(form));
  const done = items.filter((i) => i.done).length;
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)]">
      <div className="flex items-center border-b border-slate-200 px-[18px] py-3.5">
        <h2 className="text-[15px] font-semibold">Ready to rate?</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${done === items.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {done} of {items.length}
        </span>
      </div>
      <div className="px-[18px] py-4">
        {/* Segments instead of a width style: the Content-Security-Policy blocks inline style attributes. */}
        <div className="flex gap-1" aria-label={`${done} of ${items.length} complete`}>
          {items.map((i, n) => (
            <span key={i.key} className={`h-2 flex-1 rounded ${n < done ? (done === items.length ? "bg-emerald-500" : "bg-amber-500") : "bg-slate-100"}`} />
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-2.5">
              <span className={`grid h-5 w-5 place-items-center rounded-full ${i.done ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                <Icon name={i.done ? "check" : "alert"} className="h-3 w-3" />
              </span>
              <span className={i.done ? "" : "text-slate-700"}>{i.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ErrorSummary({ errors }: { errors: FieldError[] }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <b>Please fix:</b>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((e, i) => <li key={i}>{e.message}</li>)}
      </ul>
    </div>
  );
}
