"use client";

import { useActionState, useState } from "react";
import { MAX_TEXT_LENGTH } from "@ezly/messaging/limits";
import { Icon } from "@/components/icons";
import { Card, buttonClass } from "@/components/ui";
import { sendTextAction } from "../../actions";

/** Shown only when texting is switched on. */
export function TextComposer({ accountId, target, blocked }: { accountId: string; target?: string; blocked?: string }) {
  const [state, action, pending] = useActionState(sendTextAction.bind(null, accountId), null);
  return (
    <Card className="p-4">
      <form action={action} id="text" className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Icon name="message" className="h-4 w-4" /> Send a text{target && <span className="font-normal text-slate-500">to {target}</span>}</h3>
        {blocked ? (
          <p className="text-sm text-amber-800">{blocked}</p>
        ) : (
          // Remounts after each successful send, which clears the message box.
          <MessageFields key={state?.ok ?? 0} pending={pending} state={state} />
        )}
      </form>
    </Card>
  );
}

function MessageFields({ pending, state }: { pending: boolean; state: { error?: string; ok?: number } | null }) {
  const [body, setBody] = useState("");
  return (
    <>
      <textarea
        name="body"
        rows={2}
        maxLength={MAX_TEXT_LENGTH}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Text message"
        placeholder="Hi! Your renewal documents are ready…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
      <div className="flex items-center gap-3 text-sm">
        <button disabled={pending || !body.trim()} className={buttonClass("primary", "sm")}>{pending ? "Sending…" : "Send text"}</button>
        <span className="text-xs text-slate-500">{body.length}/{MAX_TEXT_LENGTH}</span>
        {state?.ok && !body && <span role="status" className="text-emerald-700">Sent.</span>}
        {state?.error && <span role="alert" className="text-red-700">{state.error}</span>}
      </div>
    </>
  );
}
