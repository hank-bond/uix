// Extension discovery — pure I/O + parsing, no activation.
//
// Walks each configured root, reads each child directory's
// `package.json`, and keeps the entries that declare a `pi` and/or
// `trellis` field. The result is what the loader (next commit) will
// activate.
//
// Discovery is deliberately separate from activation:
//   - It can't crash anything because no user code has run yet.
//   - Re-running it is cheap and side-effect-free, so reload can
//     re-discover and diff.
//   - It's the single seam where new root sources plug in later.
//
// Failure posture: broken JSON is logged loudly (you want to know
// immediately if a manifest is malformed). Missing `package.json`
// is silent (stray files in the extensions dir are fine).

import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../log";

import type { ExtensionRoot } from "./roots";

const log = createLogger("extensions");

export interface DiscoveredPackage {
  /** Package name from package.json (falls back to directory name). */
  id: string;
  /** Absolute path to the package directory. */
  dir: string;
  /** Which root this came from. */
  rootLabel: ExtensionRoot["label"];
  /** True if package.json declares a `pi` field. */
  hasPi: boolean;
  /** True if package.json declares a `trellis` field. */
  hasTrellis: boolean;
  /** Raw parsed package.json. Loader uses this to resolve manifest paths. */
  packageJson: Record<string, unknown>;
}

export const discoverPackages = (roots: ExtensionRoot[]): DiscoveredPackage[] => {
  const out: DiscoveredPackage[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root.dir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(root.dir);
    } catch (err) {
      log.warn(
        { dir: root.dir, err: (err as Error).message },
        "root_unreadable",
      );
      continue;
    }

    for (const name of entries) {
      const dir = path.join(root.dir, name);
      const manifestPath = path.join(dir, "package.json");
      if (!fs.existsSync(manifestPath)) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
          string,
          unknown
        >;
      } catch (err) {
        log.warn(
          { path: manifestPath, err: (err as Error).message },
          "package_json_invalid",
        );
        continue;
      }

      const hasPi = Boolean(parsed["pi"]);
      const hasTrellis = Boolean(parsed["trellis"]);
      // Not a Trellis-loadable package — could be a plain node_modules
      // dir or a stray npm package that wandered in. Skip silently.
      if (!hasPi && !hasTrellis) continue;

      const id = typeof parsed["name"] === "string" ? (parsed["name"] as string) : name;

      out.push({ id, dir, rootLabel: root.label, hasPi, hasTrellis, packageJson: parsed });
    }
  }

  return out;
};
