import { resolve } from "node:path";
import { createStore, type Store } from "@ezly/store";

let store: Store | undefined;

/** The app's single store instance. Data lives in EZLY_DATA_DIR, which must be outside the public web folder. */
export function getStore(): Store {
  if (!store) {
    const fieldKey = process.env.EZLY_FIELD_KEY;
    if (!fieldKey) {
      throw new Error("EZLY_FIELD_KEY is not set. Generate one with `pnpm --filter @ezly/store keygen`.");
    }
    store = createStore({
      dataDir: process.env.EZLY_DATA_DIR ?? resolve(process.cwd(), "../../.data"),
      fieldKeys: [fieldKey, ...(process.env.EZLY_FIELD_KEY_PREVIOUS?.split(",").filter(Boolean) ?? [])],
    });
  }
  return store;
}

/** Until sign-in exists (Segment 2), pages show the first agency's data. */
export async function getCurrentAgency() {
  const store = getStore();
  const [agency] = await store.agencies.list();
  if (!agency) throw new Error("No agency found. Seed demo data with `pnpm seed`.");
  return { agency, data: store.forAgency(agency.id) };
}
