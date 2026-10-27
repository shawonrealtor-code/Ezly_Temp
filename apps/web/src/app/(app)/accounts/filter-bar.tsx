"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

/** Search box and filters; changes update the URL so results can be bookmarked and shared. */
export function FilterBar({ producers }: { producers: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/accounts?${next}`);
  };
  const select = "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700";
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-4">
      <form
        className="flex min-w-[240px] max-w-[360px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-400 focus-within:border-blue-600"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
        }}
      >
        <Icon name="search" />
        <input name="q" type="search" defaultValue={params.get("q") ?? ""} placeholder="Name, email, phone, policy #, ZIP…" aria-label="Search clients" className="w-full bg-transparent text-sm text-slate-900 outline-none" />
      </form>
      <select aria-label="Show" className={select} value={params.get("mine") ?? ""} onChange={(e) => setParam("mine", e.target.value)}>
        <option value="">All clients</option>
        <option value="1">My clients</option>
      </select>
      <select aria-label="Status" className={select} value={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">Any status</option>
        <option value="NEW">New lead</option>
        <option value="CONTACTED">Contacted</option>
        <option value="QUOTED">Quoted</option>
        <option value="SOLD">Customer</option>
        <option value="LOST">Lost</option>
      </select>
      <select aria-label="Producer" className={select} value={params.get("producer") ?? ""} onChange={(e) => setParam("producer", e.target.value)}>
        <option value="">Any producer</option>
        {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Sort" className={select} value={params.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value)}>
        <option value="">Recently active</option>
        <option value="name">Name A–Z</option>
      </select>
    </div>
  );
}
