// Feature package discovery — pure I/O + parsing, no activation.
//
// Walks each configured root, reads each child directory's
// `package.json`, and keeps the directories that declare a `pi`
// and/or `uix` field. The result is what the loader activates.
//
// Discovery is deliberately separate from activation:
//   - It can't crash anything because no user code has run yet.
//   - Re-running it is cheap and side-effect-free, so reload can
//     re-discover and diff.
//   - It's the single seam where new root sources plug in later
//     (e.g. settings.json `packages:` for imported packages).
//
// Identity: the package's absolute `dir` is its identifier. Two
// packages with the same name in different roots are distinct
// because their dirs differ. We don't synthesize a composite id —
// pi uses the path-as-identity too, and any tagging we layered on
// top (project/global) would be a lie the moment we support
// configured paths that aren't either.
//
// Terminology: a discovered directory is a "package" — the on-disk
// distribution unit, which may teach pi (its `pi` field, a pi
// extension), the cockpit (its `uix` field, one or more features),
// or both. The uix-side loadable unit is the feature; `package.json`
// is just a manifest format.
//
// Ordering: within each root, entries are sorted alphabetically by
// directory name. Across roots, iteration follows the input order.
// This makes the discovered list (and the activation that follows
// it) deterministic across filesystems — small divergence from pi,
// which iterates raw `readdir` order. Pi's docs claim "extension
// load order" semantics; sorting strengthens that guarantee at
// zero cost.
//
// Failure posture: broken JSON is logged loudly (you want to know
// immediately if a manifest is malformed). Missing `package.json`
// is silent (stray files in the features dir are fine).

import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../log";

const log = createLogger("features");

export interface DiscoveredPackage {
  /** Human-readable label, taken from the package's directory name. */
  displayName: string;
  /** Absolute path to the package's directory. This is the identifier. */
  dir: string;
  /** True if package.json declares a `pi` field. */
  hasPi: boolean;
  /** True if package.json declares a `uix` field. */
  hasUIX: boolean;
  /** Raw parsed package.json. Loader uses this to resolve manifest paths. */
  packageJson: Record<string, unknown>;
}

export const discoverPackages = (roots: string[]): DiscoveredPackage[] => {
  const out: DiscoveredPackage[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch (err) {
      log.warn({ dir: root, err: (err as Error).message }, "root_unreadable");
      continue;
    }
    // Deterministic intra-root order so logs are stable across
    // filesystems. See file header.
    entries.sort();

    for (const entryName of entries) {
      const dir = path.join(root, entryName);
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
      const hasUIX = Boolean(parsed["uix"]);
      // Not a UIX-loadable package — could be a stray node_modules
      // dir or an unrelated npm package that wandered in. Skip silently.
      if (!hasPi && !hasUIX) continue;

      out.push({
        displayName: entryName,
        dir,
        hasPi,
        hasUIX,
        packageJson: parsed,
      });
    }
  }

  return out;
};
