import "server-only";
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
    const dataDir = process.env.EZLY_DATA_DIR;
    if (!dataDir && process.env.NODE_ENV === "production") {
      throw new Error("EZLY_DATA_DIR is not set. In production it must point to a private folder outside the public web folder.");
    }
    store = createStore({
      dataDir: dataDir ?? resolve(process.cwd(), "../../.data"),
      fieldKeys: [fieldKey, ...(process.env.EZLY_FIELD_KEY_PREVIOUS?.split(",").filter(Boolean) ?? [])],
    });
  }
  return store;
}
