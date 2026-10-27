"use client";

import { useActionState, useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import { buttonClass } from "@/components/ui";
import { addActivityAction } from "../../actions";

const KINDS = [["note", "Note"], ["call", "Call"], ["text", "Text"], ["email", "Email"], ["meeting", "Meeting"]] as const;

export function ActivityForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(addActivityAction.bind(null, accountId), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state?.ok]);
  return (
    <Card className="p-4">
      <form ref={form} action={action} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {KINDS.map(([value, label], i) => (
            <label key={value} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="kind" value={value} defaultChecked={i === 0} /> {label}
            </label>
          ))}
        </div>
        <label className="sr-only" htmlFor="activity-body">What happened?</label>
        <textarea
          id="activity-body"
          name="body"
          rows={3}
          maxLength={5000}
          required
          placeholder="What was discussed? Don't type SSNs or license numbers here."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <div className="flex items-center gap-3">
          <button disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Add to timeline"}</button>
          {state?.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
