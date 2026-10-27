import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { StoreError } from "./errors.ts";

/**
 * Writes a file so readers only ever see the old or the new contents, never a half-written file:
 * write to a temp file, flush it to disk, rename it over the target, then flush the directory.
 */
export async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const handle = await open(tmp, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  await syncDir(dirname(path));
}

async function syncDir(dir: string): Promise<void> {
  // Directory fsync is not supported on every platform (e.g. Windows); the rename is still atomic there.
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    /* best effort */
  }
}

export async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function fileVersion(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;

/** Cross-process lock using an exclusively created lock file. Stale locks (crashed holder) are broken after 30 s. */
export async function withFileLock<R>(path: string, fn: () => Promise<R>): Promise<R> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const started = Date.now();
  let delay = 5;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}`);
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new StoreError(`Timed out waiting for lock on ${path}`, "LOCK_TIMEOUT");
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 100);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

/** Serializes async work within this process (one queue per file). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<R>(fn: () => Promise<R>): Promise<R> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
