"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import type { Lob } from "@/lib/quote-forms";
import { createApplicationAction } from "./actions";

export function NewQuoteButtons({ accountId }: { accountId: string }) {
  const [pending, start] = useTransition();
  const make = (lob: Lob, label: string, icon: "car" | "home") => (
    <button type="button" disabled={pending} className={buttonClass("secondary")} onClick={() => start(() => createApplicationAction(accountId, lob))}>
      <Icon name={icon} className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {make("auto", "New auto quote", "car")}
      {make("home", "New home quote", "home")}
      {make("dwelling_fire", "New dwelling fire quote", "home")}
    </div>
  );
}
