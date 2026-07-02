// Where the loader looks for feature packages.
//
// Two default scopes, mirroring pi's auto-discovery model:
//   - <cwd>/.uix/features/*    (project-local, the common case)
//   - ~/.uix/features/*        (cross-project, optional)
//
// Roots are bare absolute paths. We deliberately don't tag them
// with a "kind" enum — when explicit `packages:` paths arrive from
// settings.json (pi's third discovery source, used by repos that
// import packages from outside the conventional dirs), they'll
// slot into the same string[] with no impedance.
//
// UIX ships zero discovered features. Bundled defaults are in-tree
// source (features/bundled.ts), and the cockpit's own baseline
// agent configuration (orientation block, doc map, cockpit tools)
// is *embedded-pi config*, not a feature — handled separately.
//
// `process.cwd()` is the right project anchor while we dogfood
// inside the uix repo. When the cockpit grows a real "current
// project" concept (the user opening a directory), this is where
// we'll thread that in.

import os from "node:os";
import path from "node:path";
import process from "node:process";

export const defaultRoots = (): string[] => [
  path.join(process.cwd(), ".uix", "features"),
  path.join(os.homedir(), ".uix", "features"),
];
