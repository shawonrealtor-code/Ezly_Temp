"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { IMPORT_FIELDS, MAX_IMPORT_ROWS, type Mapping } from "@ezly/core";
import { ACTIVITY_KINDS, StoreError } from "@ezly/store";
import {
  accountToForm,
  clientFormSchema,
  commitImport,
  findDuplicates,
  formToAccount,
  previewImport,
  undoImport,
  type DuplicateMatch,
  type FieldError,
  type ImportPreview,
} from "@/lib/accounts";
import { getRequestMeta, requireUser } from "@/lib/auth";
import type { ClientForm } from "@/lib/client-form";
import { getStore } from "@/lib/store";
import { sendClientText } from "@/lib/texting";

export type SaveResult = { errors?: FieldError[]; duplicates?: DuplicateMatch[] } | undefined;

function storeErrors(err: unknown): FieldError[] {
  if (err instanceof StoreError && err.code === "VALIDATION") return [{ field: "", message: err.message }];
  throw err;
}

export async function createAccountAction(form: ClientForm, allowDuplicate: boolean): Promise<SaveResult> {
  const { data } = await requireUser("accounts:write");
  const parsed = clientFormSchema.safeParse(form);
  if (!parsed.success) return { errors: [{ field: "", message: "The form couldn't be read. Reload the page and try again." }] };
  const result = await formToAccount(parsed.data, { data, cipher: getStore().cipher });
  if (result.errors.length) return { errors: result.errors };
  if (!allowDuplicate) {
    const duplicates = await findDuplicates(data, result.input!);
    if (duplicates.length) return { duplicates };
  }
  let id: string;
  try {
    id = (await data.accounts.create(result.input!)).id;
  } catch (err) {
    return { errors: storeErrors(err) };
  }
  revalidatePath("/accounts");
  redirect(`/accounts/${id}`);
}

export async function updateAccountAction(accountId: string, form: ClientForm): Promise<SaveResult & { saved?: ClientForm }> {
  const { data } = await requireUser("accounts:write");
  const existing = await data.accounts.get(accountId);
  if (!existing || existing.deletedAt) return { errors: [{ field: "", message: "This client no longer exists." }] };
  const parsed = clientFormSchema.safeParse(form);
  if (!parsed.success) return { errors: [{ field: "", message: "The form couldn't be read. Reload the page and try again." }] };
  // Lead fields are edited on the Lead info tab; keep them as they are here.
  const merged = {
    ...parsed.data,
    producerId: existing.producerId ?? "",
    csrId: existing.csrId ?? "",
    leadSource: existing.leadSource ?? "",
    leadStatus: existing.leadStatus,
    leadPriority: existing.leadPriority ?? "",
    probabilityOfSale: existing.probabilityOfSale?.toString() ?? "",
    customerSince: existing.customerSince ?? "",
    vip: existing.vip,
    labels: existing.labels.join(", "),
  };
  const result = await formToAccount(merged, { data, cipher: getStore().cipher, existing });
  if (result.errors.length) return { errors: result.errors };
  let updated;
  try {
    updated = await data.accounts.update(accountId, result.input!);
  } catch (err) {
    return { errors: storeErrors(err) };
  }
  revalidatePath(`/accounts/${accountId}`, "layout");
  // Return the saved, cleaned-up version so the form shows exactly what is stored.
  return { saved: accountToForm(updated) };
}

export async function updateLeadAction(accountId: string, form: ClientForm): Promise<SaveResult & { saved?: ClientForm }> {
  const { data } = await requireUser("accounts:write");
  const existing = await data.accounts.get(accountId);
  if (!existing || existing.deletedAt) return { errors: [{ field: "", message: "This client no longer exists." }] };
  const parsed = clientFormSchema.safeParse(form);
  if (!parsed.success) return { errors: [{ field: "", message: "The form couldn't be read." }] };
  const result = await formToAccount(parsed.data, { data, cipher: getStore().cipher, existing });
  if (result.errors.length) return { errors: result.errors };
  const { producerId, csrId, leadSource, leadStatus, leadPriority, probabilityOfSale, customerSince, vip, labels } = result.input!;
  const updated = await data.accounts.update(accountId, { producerId, csrId, leadSource, leadStatus, leadPriority, probabilityOfSale, customerSince, vip, labels });
  revalidatePath(`/accounts/${accountId}`, "layout");
  return { saved: accountToForm(updated) };
}

const activityInput = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  body: z.string().trim().min(1, "Write something first.").max(5000),
});

export async function addActivityAction(accountId: string, _prev: { error?: string; ok?: number } | null, form: FormData) {
  const { user, data } = await requireUser("accounts:write");
  if (!(await data.accounts.get(accountId))) return { error: "This client no longer exists." };
  const parsed = activityInput.safeParse({ kind: form.get("kind"), body: form.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the note." };
  await data.activities.create({ accountId, ...parsed.data, occurredAt: new Date().toISOString(), authorId: user.id });
  revalidatePath(`/accounts/${accountId}`, "layout");
  return { ok: Date.now() };
}

/** Shows a full SSN or license number once. Admin only; every reveal is logged with who, when and why. */
export async function revealAction(accountId: string, personId: string, field: "ssn" | "dlNumber", reason: string) {
  const { data } = await requireUser("restricted:reveal");
  if (reason.trim().length < 3) return { error: "Enter a reason (it is recorded in the activity log)." };
  const person = (await data.accounts.get(accountId))?.people.find((p) => p.id === personId);
  const value = person?.[field];
  if (!person || !value) return { error: "Nothing saved for this field." };
  const meta = await getRequestMeta();
  await data.logEvent("data.revealed", `${field === "ssn" ? "SSN" : "Driver's license"} of ${person.firstName} ${person.lastName} — reason: ${reason.trim().slice(0, 200)}`, accountId, meta);
  const plain = getStore().cipher.decrypt(value);
  return { value: field === "ssn" ? `${plain.slice(0, 3)}-${plain.slice(3, 5)}-${plain.slice(5)}` : plain };
}

// ---------- Import ----------

const importInput = z.object({
  rows: z.array(z.array(z.string().max(1000)).max(100)).min(1).max(MAX_IMPORT_ROWS),
  mapping: z.partialRecord(z.enum(IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]]), z.number().int().min(0).max(99)),
});

export async function previewImportAction(rows: string[][], mapping: Mapping): Promise<{ preview?: ImportPreview; error?: string }> {
  const { data } = await requireUser("accounts:import");
  const parsed = importInput.safeParse({ rows, mapping });
  if (!parsed.success) return { error: "The file couldn't be read. Check that it's a CSV with at most 10,000 rows." };
  return { preview: await previewImport(data, parsed.data.rows, parsed.data.mapping as Mapping) };
}

export async function commitImportAction(rows: string[][], mapping: Mapping, skipDuplicates: boolean, fileName: string) {
  const { data } = await requireUser("accounts:import");
  const parsed = importInput.safeParse({ rows, mapping });
  if (!parsed.success) return { error: "The file couldn't be read." };
  const result = await commitImport(data, getStore().cipher, parsed.data.rows, parsed.data.mapping as Mapping, { skipDuplicates });
  await data.logEvent(
    "data.imported",
    `Imported ${result.imported} clients from "${fileName.slice(0, 100)}" (${result.skipped} skipped); batch ${result.batchId}`,
    undefined,
    await getRequestMeta(),
  );
  revalidatePath("/accounts");
  return { result };
}

export async function undoImportAction(batchId: string) {
  const { data } = await requireUser("accounts:import");
  if (!z.uuid().safeParse(batchId).success) return { error: "Unknown import." };
  const result = await undoImport(data, batchId);
  await data.logEvent("data.import_undone", `Undid import ${batchId}: removed ${result.removed}, kept ${result.kept} changed since`, undefined, await getRequestMeta());
  revalidatePath("/accounts");
  return { result };
}

/** Sends a text to the client through the configured texting provider (off until set up). */
export async function sendTextAction(accountId: string, _prev: { error?: string; ok?: number } | null, form: FormData) {
  const { user, data } = await requireUser("accounts:write");
  const account = await data.accounts.get(accountId);
  if (!account || account.deletedAt) return { error: "This client no longer exists." };
  const result = await sendClientText(data, user, account, String(form.get("body") ?? ""));
  if ("error" in result) return { error: result.error };
  revalidatePath(`/accounts/${accountId}`, "layout");
  return { ok: Date.now() };
}
