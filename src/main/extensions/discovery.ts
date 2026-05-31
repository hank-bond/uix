// Extension discovery — pure I/O + parsing, no activation.
//
// Walks each configured root, reads each child directory's
// `package.json`, and keeps the directories that declare a `pi`
// and/or `trellis` field. The result is what the loader activates.
//
// Discovery is deliberately separate from activation:
//   - It can't crash anything because no user code has run yet.
//   - Re-running it is cheap and side-effect-free, so reload can
//     re-discover and diff.
//   - It's the single seam where new root sources plug in later
//     (e.g. settings.json `packages:` for imported extensions).
//
// Identity: the extension's absolute `dir` is its identifier. Two
// extensions with the same name in different roots are distinct
// because their dirs differ. We don't synthesize a composite id —
// pi uses the path-as-identity too, and any tagging we layered on
// top (project/global) would be a lie the moment we support
// configured paths that aren't either.
//
// Terminology: we use "extension" throughout. The on-disk thing
// happens to live in a directory with a `package.json`, but that's
// an implementation detail of where extensions live, not a
// separate conceptual unit. Pi uses the same convention; the file
// `package.json` is just a manifest format.
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
// is silent (stray files in the extensions dir are fine).

import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../log";

const log = createLogger("extensions");

export interface DiscoveredExtension {
  /** Human-readable label, taken from the extension's directory name. */
  displayName: string;
  /** Absolute path to the extension's directory. This is the identifier. */
  dir: string;
  /** True if package.json declares a `pi` field. */
  hasPi: boolean;
  /** True if package.json declares a `trellis` field. */
  hasTrellis: boolean;
  /** Raw parsed package.json. Loader uses this to resolve manifest paths. */
  packageJson: Record<string, unknown>;
}

export const discoverExtensions = (
  roots: string[],
): DiscoveredExtension[] => {
  const out: DiscoveredExtension[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch (err) {
      log.warn(
        { dir: root, err: (err as Error).message },
        "root_unreadable",
      );
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
      const hasTrellis = Boolean(parsed["trellis"]);
      // Not a Trellis-loadable package — could be a stray node_modules
      // dir or an unrelated npm package that wandered in. Skip silently.
      if (!hasPi && !hasTrellis) continue;

      out.push({
        displayName: entryName,
        dir,
        hasPi,
        hasTrellis,
        packageJson: parsed,
      });
    }
  }

  return out;
};
