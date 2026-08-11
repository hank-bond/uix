// Persists a bounded newest-first list of workspace manifests that still exist.
//
// A tiny JSON list under the host's userData dir: which workspace manifests
// the host opened, newest first. The start picker reads it. Opening a workspace
// records it. The module prunes entries whose manifest file no longer exists on
// read, so deleted workspaces silently drop off the list.
//
// Deliberately synchronous and whole-file: the module caps the list, reads it once
// per picker display, and writes it once per workspace open.

import fs from "node:fs";
import path from "node:path";

import { createLogger } from "@uix/runtime/log";
import type { RecentWorkspace } from "#shared/ipc";

const log = createLogger("recents");

const MaxRecents = 10;

export interface RecentsStore {
  /** Newest-first recents whose manifest files still exist. */
  list(): RecentWorkspace[];
  /** Upsert to the front (identity: manifestPath) and persist. */
  record(entry: { manifestPath: string; name: string }): void;
}

export function createRecentsStore(filePath: string): RecentsStore {
  const read = (): RecentWorkspace[] => {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch {
      // Missing file is the empty list (first run).
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is RecentWorkspace =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as RecentWorkspace).manifestPath === "string" &&
          typeof (e as RecentWorkspace).name === "string" &&
          typeof (e as RecentWorkspace).openedAt === "string",
      );
    } catch (err) {
      // A corrupt recents file is cosmetic state. Log and start over.
      log.warn({ filePath, err: (err as Error).message }, "recents_corrupt");
      return [];
    }
  };

  const write = (entries: RecentWorkspace[]): void => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`);
    } catch (err) {
      log.warn({ filePath, err: (err as Error).message }, "recents_unwritable");
    }
  };

  return {
    list() {
      return read().filter((e) => fs.existsSync(e.manifestPath));
    },
    record(entry) {
      const rest = read().filter((e) => e.manifestPath !== entry.manifestPath);
      write(
        [{ ...entry, openedAt: new Date().toISOString() }, ...rest].slice(
          0,
          MaxRecents,
        ),
      );
    },
  };
}
