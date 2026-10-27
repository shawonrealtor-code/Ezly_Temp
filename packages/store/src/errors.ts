export class StoreError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "VALIDATION" | "LOCK_TIMEOUT" | "CORRUPT" | "CONFIG") {
    super(message);
    this.name = "StoreError";
  }
}
