"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { IMPORT_FIELDS, guessMapping, parseCsv, type ImportField, type Mapping } from "@ezly/core";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import type { ImportPreview } from "@/lib/accounts";
import { commitImportAction, previewImportAction, undoImportAction } from "../actions";

const MAX_BYTES = 7 * 1024 * 1024;

type Parsed = { fileName: string; headers: string[]; rows: string[][]; problems: string[] };

/** Keeps only the mapped columns, so unused columns in the file never leave the browser. */
function compact(rows: string[][], mapping: Mapping): { rows: string[][]; mapping: Mapping } {
  const fields = Object.entries(mapping).filter(([, i]) => i !== undefined) as [ImportField, number][];
  return {
    rows: rows.map((r) => fields.map(([, i]) => r[i] ?? "")),
    mapping: Object.fromEntries(fields.map(([f], j) => [f, j])) as Mapping,
  };
}

export function ImportWizard() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [done, setDone] = useState<{ imported: number; skipped: number; batchId: string } | null>(null);
  const [undone, setUndone] = useState<{ removed: number; kept: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const examples = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.map((_, i) => parsed.rows.find((r) => r[i]?.trim())?.[i] ?? "");
  }, [parsed]);

  async function readFile(file: File) {
    setError("");
    setPreview(null);
    setDone(null);
    if (file.size > MAX_BYTES) return setError("That file is larger than 7 MB. Split it into smaller files.");
    const text = await file.text();
    const { headers, rows, errors } = parseCsv(text);
    if (!headers.length || !rows.length) return setError("No rows found. Is this a CSV with a header row?");
    setParsed({ fileName: file.name, headers, rows, problems: errors });
    setMapping(guessMapping(headers));
  }

  const check = () =>
    startTransition(async () => {
      setError("");
      const c = compact(parsed!.rows, mapping);
      const result = await previewImportAction(c.rows, c.mapping);
      if (result.error) setError(result.error);
      else setPreview(result.preview!);
    });

  const runImport = () =>
    startTransition(async () => {
      const c = compact(parsed!.rows, mapping);
      const result = await commitImportAction(c.rows, c.mapping, skipDuplicates, parsed!.fileName);
      if ("error" in result && result.error) setError(result.error);
      else if ("result" in result && result.result) setDone(result.result);
    });

  const undo = () =>
    startTransition(async () => {
      if (!done || !window.confirm(`Remove the ${done.imported} clients added by this import?`)) return;
      const result = await undoImportAction(done.batchId);
      if ("result" in result && result.result) setUndone(result.result);
    });

  const hasName = mapping.fullName !== undefined || (mapping.firstName !== undefined && mapping.lastName !== undefined);
  const importCount = preview ? preview.ready - (skipDuplicates ? preview.duplicates.length : 0) : 0;

  if (done) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Icon name="check" /></span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{undone ? "Import undone" : `Imported ${done.imported} clients`}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {undone
                ? `Removed ${undone.removed} clients.${undone.kept ? ` Kept ${undone.kept} that someone changed after the import.` : ""}`
                : `${done.skipped ? `${done.skipped} rows were skipped (errors or likely duplicates). ` : ""}SSNs and license numbers were encrypted on arrival.`}
            </p>
            <div className="mt-4 flex gap-2">
              <Link href="/accounts" className={buttonClass("primary")}>View clients</Link>
              {!undone && <button type="button" disabled={pending} className={buttonClass("danger")} onClick={undo}>Undo this import</button>}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <Card>
        <CardHeader title="1. Choose a file" icon="upload" action={<a href="/client-import-template.csv" download className="text-blue-700">Download a template</a>} />
        <div className="flex flex-col gap-2 px-[18px] py-4 text-sm">
          <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} className="text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:font-semibold" />
          <p className="text-slate-500">
            In EZLynx or Excel, export or &ldquo;Save as&rdquo; <b>CSV</b>. Up to 10,000 rows. The file is read in your browser; only the
            columns you choose below are sent to Ezly.
          </p>
          {parsed && (
            <p>
              <b>{parsed.fileName}</b>: {parsed.rows.length} rows, {parsed.headers.length} columns.
              {parsed.problems.map((p) => <span key={p} className="block text-amber-700">{p}</span>)}
            </p>
          )}
        </div>
      </Card>

      {parsed && (
        <Card>
          <CardHeader title="2. Match the columns" icon="accounts" />
          <p className="px-[18px] pt-3 text-sm text-slate-500">We guessed from your column names. Fix any that are wrong, and leave a field on &ldquo;Don&apos;t import&rdquo; to skip it.</p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2">Ezly field</th>
                  <th className="px-4 py-2">Column in your file</th>
                  <th className="px-4 py-2">Example from your file</th>
                </tr>
              </thead>
              <tbody>
                {IMPORT_FIELDS.map((f) => {
                  const col = mapping[f.key];
                  const sensitive = f.key === "ssn" || f.key === "dlNumber";
                  return (
                    <tr key={f.key} className="border-b border-slate-100">
                      <td className="px-4 py-1.5 font-medium">{f.label}{sensitive && <span className="ml-1.5"><Badge tone="amber" dot={false}>encrypted</Badge></span>}</td>
                      <td className="px-4 py-1.5">
                        <select
                          aria-label={`Column for ${f.label}`}
                          value={col ?? ""}
                          onChange={(e) => {
                            setPreview(null);
                            setMapping((m) => {
                              const next = { ...m };
                              if (e.target.value === "") delete next[f.key];
                              else next[f.key] = Number(e.target.value);
                              return next;
                            });
                          }}
                          className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                        >
                          <option value="">Don&apos;t import</option>
                          {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                        </select>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-1.5 text-slate-500">
                        {col === undefined ? "" : sensitive ? (examples[col] ? "•••• (hidden)" : "") : examples[col]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 px-[18px] py-4">
            <button type="button" disabled={!hasName || pending} className={buttonClass("primary")} onClick={check}>
              {pending && !preview ? "Checking…" : "Check file"}
            </button>
            {!hasName && <span className="text-sm text-amber-700">Choose First name and Last name (or Full name).</span>}
          </div>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader title="3. Review and import" icon="check" />
          <div className="flex flex-col gap-4 px-[18px] py-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Rows", preview.total, "gray"],
                ["Ready", preview.ready, "green"],
                ["Possible duplicates", preview.duplicates.length, "amber"],
                ["Can't import", preview.errors.length, "red"],
              ].map(([label, n, tone]) => (
                <div key={label as string} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className={`text-2xl font-bold ${tone === "red" && n ? "text-red-700" : tone === "amber" && n ? "text-amber-700" : ""}`}>{n}</div>
                </div>
              ))}
            </div>

            {preview.errors.length > 0 && (
              <details open className="rounded-lg border border-red-200 bg-red-50 p-3">
                <summary className="cursor-pointer font-semibold text-red-800">Rows that can&apos;t be imported ({preview.errors.length})</summary>
                <ul className="mt-2 max-h-48 overflow-y-auto">{preview.errors.slice(0, 200).map((e) => <li key={e.line}>Line {e.line}: {e.messages.join(" ")}</li>)}</ul>
              </details>
            )}
            {preview.duplicates.length > 0 && (
              <details open className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <summary className="cursor-pointer font-semibold">Possible duplicates ({preview.duplicates.length})</summary>
                <ul className="mt-2 max-h-56 overflow-y-auto">
                  {preview.duplicates.slice(0, 200).map((d) => (
                    <li key={d.line} className="py-0.5">
                      Line {d.line}: <b>{d.name}</b> matches{" "}
                      {d.matches.map((m, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          {m.id ? <Link href={`/accounts/${m.id}`} target="_blank" className="text-blue-700 hover:underline">{m.name}</Link> : m.name} (same {m.reasons.join(", ")})
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.warnings.length > 0 && (
              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-semibold">Values that were cleaned up or left out ({preview.warnings.length} rows)</summary>
                <ul className="mt-2 max-h-48 overflow-y-auto text-slate-600">{preview.warnings.slice(0, 200).map((w) => <li key={w.line}>Line {w.line}: {w.messages.join(" ")}</li>)}</ul>
              </details>
            )}
            {preview.unknownProducers.length > 0 && (
              <p className="text-amber-800">
                These producers or CSRs aren&apos;t Ezly users, so those clients will be unassigned: {preview.unknownProducers.join(", ")}. Add them under Users first if you want them assigned.
              </p>
            )}

            {preview.duplicates.length > 0 && (
              <fieldset className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2"><input type="radio" checked={skipDuplicates} onChange={() => setSkipDuplicates(true)} /> Skip possible duplicates (recommended)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={!skipDuplicates} onChange={() => setSkipDuplicates(false)} /> Import them anyway</label>
              </fieldset>
            )}
            <div>
              <button type="button" disabled={pending || importCount <= 0} className={buttonClass("primary")} onClick={runImport}>
                {pending ? "Importing…" : `Import ${importCount} clients`}
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
