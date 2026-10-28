"use client";

import { useEffect, useState, useTransition } from "react";
import type { RiskIssue } from "@ezly/rating";
import { FormSection, SelectField, TextField, Toggle, grid4 } from "@/components/form-controls";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { driverFrom, emptyDriver, emptyVehicle, fieldId, getPath, setPath, type Draft, type HouseholdPerson, type Lob } from "@/lib/quote-forms";
import { rateApplicationAction, saveApplicationAction } from "../actions";

type Opt = readonly (readonly [string, string])[];
const O = {
  relationship: [["insured", "Named insured"], ["spouse", "Spouse"], ["child", "Child"], ["other", "Other"]],
  license: [["valid", "Valid"], ["permit", "Learner's permit"], ["suspended", "Suspended"], ["revoked", "Revoked"], ["expired", "Expired"], ["none", "Not licensed (excluded)"]],
  gender: [["Male", "Male"], ["Female", "Female"], ["Non-binary", "Non-binary"]],
  marital: [["Single", "Single"], ["Married", "Married"], ["Divorced", "Divorced"], ["Widowed", "Widowed"], ["Separated", "Separated"], ["Domestic partner", "Domestic partner"]],
  use: [["commute", "Commute"], ["pleasure", "Pleasure"], ["business", "Business"]],
  ownership: [["owned", "Owned"], ["financed", "Financed"], ["leased", "Leased"]],
  physDed: [["none", "No coverage"], ["250", "$250"], ["500", "$500"], ["1000", "$1,000"]],
  bi: [["30/60", "$30k / $60k (state minimum)"], ["50/100", "$50k / $100k"], ["100/300", "$100k / $300k"], ["250/500", "$250k / $500k"]],
  pd: [["15000", "$15,000"], ["25000", "$25,000"], ["50000", "$50,000"], ["100000", "$100,000"]],
  um: [["30/60", "$30k / $60k"], ["50/100", "$50k / $100k"], ["100/300", "$100k / $300k"], ["250/500", "$250k / $500k"], ["rejected", "Rejected (signed form needed)"]],
  autoMed: [["0", "None"], ["1000", "$1,000"], ["5000", "$5,000"], ["10000", "$10,000"]],
  homeForm: [["HO3", "HO3 — homeowners"], ["HO5", "HO5 — premium homeowners"], ["HO6", "HO6 — condo"], ["HO4", "HO4 — renters"]],
  dpForm: [["DP3", "DP3 — special (open perils)"], ["DP1", "DP1 — basic (named perils)"]],
  homeOcc: [["owner", "Owner-occupied"], ["seasonal", "Seasonal / secondary"]],
  dpOcc: [["rental", "Rented to others"], ["owner", "Owner-occupied"], ["vacant", "Vacant"]],
  construction: [["frame", "Frame"], ["masonry", "Masonry (brick/block)"], ["masonry_veneer", "Masonry veneer"], ["fire_resistive", "Fire resistive"]],
  roof: [["asphalt", "Asphalt shingle"], ["architectural", "Architectural shingle"], ["metal", "Metal"], ["tile", "Tile"], ["slate", "Slate"], ["wood_shake", "Wood shake"], ["flat", "Flat / membrane"]],
  protection: Array.from({ length: 10 }, (_, i) => [String(i + 1), `Class ${i + 1}`] as const),
  liability: [["100000", "$100,000"], ["300000", "$300,000"], ["500000", "$500,000"]],
  dpLiability: [["0", "None"], ["100000", "$100,000"], ["300000", "$300,000"], ["500000", "$500,000"]],
  homeMed: [["1000", "$1,000"], ["2000", "$2,000"], ["5000", "$5,000"]],
  deductible: [["500", "$500"], ["1000", "$1,000"], ["2500", "$2,500"], ["5000", "$5,000"]],
  water: [["0", "None"], ["5000", "$5,000"], ["10000", "$10,000"], ["25000", "$25,000"]],
} satisfies Record<string, Opt>;

export function QuoteEditor(props: {
  accountId: string;
  appId: string;
  lob: Lob;
  initial: Draft;
  initialIssues: RiskIssue[];
  household: HouseholdPerson[];
  propertyAddress: string;
  canRate: boolean;
  fix?: string;
}) {
  const [draft, setDraft] = useState<Draft>(props.initial);
  const [issues, setIssues] = useState<RiskIssue[]>(props.initialIssues);
  const [showIssues, setShowIssues] = useState(!!props.fix);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!props.fix) return;
    const el = document.getElementById(fieldId(props.fix));
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  }, [props.fix]);

  const set = (path: string, value: unknown) => {
    setStatus("");
    setDraft((d) => setPath(d, path, value));
  };
  const issueFor = (path: string) => (showIssues ? issues.find((i) => i.path === path)?.message : undefined);
  const str = (path: string) => String(getPath(draft, path) ?? "");

  const text = (path: string, label: string, extra: Record<string, unknown> = {}) => (
    <TextField id={fieldId(path)} label={label} value={str(path)} error={issueFor(path)} onValue={(v) => set(path, v)} {...extra} />
  );
  const select = (path: string, label: string, options: Opt, extra: Record<string, unknown> = {}) => (
    <SelectField id={fieldId(path)} label={label} value={str(path)} options={options} error={issueFor(path)} onValue={(v) => set(path, v)} {...extra} />
  );
  const toggle = (path: string, label: string) => (
    <Toggle id={fieldId(path)} label={label} checked={getPath(draft, path) === true} onValue={(v) => set(path, v)} />
  );

  const save = () =>
    startTransition(async () => {
      const r = await saveApplicationAction(props.accountId, props.appId, draft);
      setIssues(r.issues);
      setStatus(r.issues.length ? `Saved. ${r.issues.length} item${r.issues.length === 1 ? "" : "s"} still needed before quoting.` : "Saved. Ready to quote.");
    });
  const rate = () =>
    startTransition(async () => {
      setShowIssues(true);
      const r = await rateApplicationAction(props.accountId, props.appId, draft);
      if (r?.issues) {
        setIssues(r.issues);
        setStatus("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  const drivers = (draft.drivers as Draft[] | undefined) ?? [];
  const vehicles = (draft.vehicles as Draft[] | undefined) ?? [];
  const addable = props.household.filter((p) => !drivers.some((d) => d.personId === p.id));
  const policy = props.lob === "auto" ? null : (draft as Draft);

  return (
    <div className="flex flex-col gap-4">
      {props.fix && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          An insurer needs the highlighted information. Fill it in, then choose <b>Get quotes</b> again.
        </div>
      )}
      {showIssues && issues.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <b>Before quoting, fix:</b>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((i) => (
              <li key={i.path + i.message}>
                <a href={`#${fieldId(i.path)}`} className="underline" onClick={() => setTimeout(() => document.getElementById(fieldId(i.path))?.focus(), 0)}>{i.message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset disabled={!props.canRate || pending} className="min-w-0 rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)]">
        {props.lob === "auto" ? (
          <>
            <FormSection title="Policy" description="When coverage starts and the client's insurance history.">
              <div className={grid4}>
                {text("effectiveDate", "Effective date", { type: "date" })}
                {text("priorInsurance.carrier", "Current / prior insurer", { placeholder: "Optional" })}
                {text("priorInsurance.yearsInsured", "Years continuously insured", { type: "number", min: 0 })}
                {text("priorInsurance.lapseDays", "Days without insurance (last 3 yrs)", { type: "number", min: 0 })}
              </div>
            </FormSection>
            <FormSection title="Drivers" description="Everyone in the household of driving age. Mark people who won't drive as Not licensed.">
              <div className="flex flex-col gap-4">
                {drivers.map((d, i) => (
                  <div key={String(d.id)} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2 font-semibold">
                      <Icon name="accounts" className="h-4 w-4 text-slate-500" /> Driver {i + 1}
                      <button type="button" className="ml-auto text-sm font-semibold text-red-700 hover:underline" onClick={() => set("drivers", drivers.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                    <div className={grid4}>
                      {text(`drivers.${i}.firstName`, "First name")}
                      {text(`drivers.${i}.lastName`, "Last name")}
                      {text(`drivers.${i}.dateOfBirth`, "Date of birth", { type: "date" })}
                      {select(`drivers.${i}.relationship`, "Relationship", O.relationship)}
                      {select(`drivers.${i}.gender`, "Gender", O.gender, { placeholder: "Optional" })}
                      {select(`drivers.${i}.maritalStatus`, "Marital status", O.marital, { placeholder: "Optional" })}
                      {select(`drivers.${i}.licenseStatus`, "License status", O.license)}
                      {text(`drivers.${i}.yearsLicensed`, "Years licensed", { type: "number", min: 0 })}
                      {text(`drivers.${i}.violations`, "Violations (3 yrs)", { type: "number", min: 0 })}
                      {text(`drivers.${i}.atFaultAccidents`, "At-fault accidents (3 yrs)", { type: "number", min: 0 })}
                      <div className="flex flex-col justify-end gap-2 sm:col-span-2">
                        {toggle(`drivers.${i}.goodStudent`, "Good student (B average, under 25)")}
                        {toggle(`drivers.${i}.defensiveDriving`, "Defensive driving course")}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {addable.map((p) => (
                    <button key={p.id} type="button" className={buttonClass("secondary", "sm")} onClick={() => set("drivers", [...drivers, driverFrom(p)])}>
                      <Icon name="plus" className="h-4 w-4" /> Add {p.firstName}
                    </button>
                  ))}
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={() => set("drivers", [...drivers, { ...emptyDriver(), lastName: drivers[0]?.lastName ?? "" }])}>
                    <Icon name="plus" className="h-4 w-4" /> Add another driver
                  </button>
                </div>
              </div>
            </FormSection>
            <FormSection title="Vehicles">
              <div className="flex flex-col gap-4">
                {vehicles.map((v, i) => (
                  <div key={String(v.id)} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2 font-semibold">
                      <Icon name="car" className="h-4 w-4 text-slate-500" /> Vehicle {i + 1}
                      <button type="button" className="ml-auto text-sm font-semibold text-red-700 hover:underline" onClick={() => set("vehicles", vehicles.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                    <div className={grid4}>
                      {text(`vehicles.${i}.year`, "Year", { type: "number", min: 1960 })}
                      {text(`vehicles.${i}.make`, "Make", { placeholder: "e.g. Toyota" })}
                      {text(`vehicles.${i}.model`, "Model", { placeholder: "e.g. RAV4" })}
                      {text(`vehicles.${i}.vin`, "VIN", { placeholder: "Optional", maxLength: 17 })}
                      {select(`vehicles.${i}.use`, "Use", O.use)}
                      {text(`vehicles.${i}.annualMiles`, "Annual miles", { inputMode: "numeric" })}
                      {select(`vehicles.${i}.ownership`, "Ownership", O.ownership)}
                      <div />
                      {select(`vehicles.${i}.comprehensiveDeductible`, "Comprehensive deductible", O.physDed)}
                      {select(`vehicles.${i}.collisionDeductible`, "Collision deductible", O.physDed)}
                      <div className="flex flex-col justify-end gap-2 sm:col-span-2">
                        {toggle(`vehicles.${i}.rentalReimbursement`, "Rental reimbursement")}
                        {toggle(`vehicles.${i}.roadside`, "Roadside assistance")}
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className={`${buttonClass("secondary", "sm")} self-start`} onClick={() => set("vehicles", [...vehicles, emptyVehicle()])}>
                  <Icon name="plus" className="h-4 w-4" /> Add vehicle
                </button>
              </div>
            </FormSection>
            <FormSection title="Coverages" description="Applies to every vehicle. Physical damage deductibles are set per vehicle above.">
              <div className={grid4}>
                {select("coverages.bodilyInjury", "Bodily injury", O.bi)}
                {select("coverages.propertyDamage", "Property damage", O.pd)}
                {select("coverages.uninsuredMotorist", "Uninsured motorist", O.um)}
                {select("coverages.medicalPayments", "Medical payments", O.autoMed)}
              </div>
            </FormSection>
          </>
        ) : (
          <>
            <FormSection title="Policy">
              <div className={grid4}>
                {text("effectiveDate", "Effective date", { type: "date" })}
                {select("form", "Policy form", props.lob === "home" ? O.homeForm : O.dpForm)}
                {select("occupancy", "Occupancy", props.lob === "home" ? O.homeOcc : O.dpOcc)}
                {props.lob === "dwelling_fire" && text("units", "Units", { type: "number", min: 1, max: 4 })}
              </div>
            </FormSection>
            <FormSection title="Property" description={`Rated at the client's address: ${props.propertyAddress || "no address on file yet"}.`}>
              <div className={grid4}>
                {text("yearBuilt", "Year built", { type: "number" })}
                {text("squareFeet", "Square feet", { inputMode: "numeric" })}
                {text("stories", "Stories", { type: "number", min: 1 })}
                {select("construction", "Construction", O.construction)}
                {select("roofType", "Roof type", O.roof)}
                {text("roofYear", "Roof installed / updated (year)", { type: "number", hint: "Some insurers require this for older homes" })}
                {select("protectionClass", "Protection class", O.protection, { hint: "From the fire department rating (1 = best)" })}
                {text("hydrantFeet", "Distance to hydrant (feet)", { inputMode: "numeric" })}
              </div>
            </FormSection>
            <FormSection title="Coverages">
              <div className={grid4}>
                {props.lob === "home" ? (
                  <>
                    {text("coverages.dwelling", "Dwelling (A)", { inputMode: "numeric", placeholder: policy?.form === "HO4" ? "0 for renters" : "Replacement cost", hint: "Cost to rebuild, not market value" })}
                    {text("coverages.personalProperty", "Personal property (C)", {
                      inputMode: "numeric",
                      hint: (
                        <button type="button" className="text-blue-700 hover:underline" onClick={() => set("coverages.personalProperty", String(Math.round(Number(str("coverages.dwelling").replace(/\D/g, "")) * 0.5)))}>
                          Use 50% of dwelling
                        </button>
                      ),
                    })}
                    {select("coverages.liability", "Liability", O.liability)}
                    {select("coverages.medicalPayments", "Medical payments", O.homeMed)}
                    {select("coverages.deductible", "All-peril deductible", O.deductible)}
                    {select("coverages.waterBackup", "Water backup", O.water)}
                    <div className="flex items-end sm:col-span-2">{toggle("coverages.replacementCostContents", "Replacement cost on contents")}</div>
                  </>
                ) : (
                  <>
                    {text("coverages.dwelling", "Dwelling (A)", { inputMode: "numeric", hint: "Cost to rebuild" })}
                    {text("coverages.fairRentalValue", "Fair rental value (D)", { inputMode: "numeric", hint: "About 10–20% of dwelling" })}
                    {select("coverages.liability", "Premises liability", O.dpLiability)}
                    {select("coverages.deductible", "Deductible", O.deductible)}
                  </>
                )}
              </div>
            </FormSection>
            <FormSection title="Risk details">
              <div className={grid4}>
                {text("claims5yr", "Claims in last 5 years", { type: "number", min: 0 })}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {toggle("fireAlarm", "Central fire alarm")}
                {toggle("burglarAlarm", "Central burglar alarm")}
                {toggle("sprinklers", "Sprinkler system")}
                {toggle("pool", "Swimming pool")}
                {toggle("trampoline", "Trampoline")}
                {toggle("dog", "Dog")}
              </div>
            </FormSection>
          </>
        )}
      </fieldset>

      {props.canRate && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-[10px] border border-slate-200 bg-white/95 p-3 backdrop-blur">
          <button type="button" className={buttonClass("primary")} disabled={pending} onClick={rate}>
            <Icon name="quotes" className="h-4 w-4" /> {pending ? "Working…" : "Get quotes"}
          </button>
          <button type="button" className={buttonClass()} disabled={pending} onClick={save}>Save draft</button>
          {status && <span role="status" className="text-sm text-slate-600">{status}</span>}
        </div>
      )}
    </div>
  );
}
