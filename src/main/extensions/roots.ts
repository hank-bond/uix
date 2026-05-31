// Where the loader looks for UIX extensions.
//
// Two default scopes, mirroring pi's auto-discovery model:
//   - <cwd>/.uix/extensions/*    (project-local, the common case)
//   - ~/.uix/extensions/*        (cross-project, optional)
//
// Roots are bare absolute paths. We deliberately don't tag them
// with a "kind" enum — when explicit `packages:` paths arrive from
// settings.json (pi's third discovery source, used by repos that
// import extensions from outside the conventional dirs), they'll
// slot into the same string[] with no impedance.
//
// UIX itself ships zero extensions. The cockpit's own baseline
// agent configuration (orientation block, doc map, cockpit tools)
// is *embedded-pi config*, not an extension — handled separately
// when milestone 4 lands.
//
// `process.cwd()` is the right project anchor while we dogfood
// inside the uix repo. When the cockpit grows a real "current
// project" concept (the user opening a directory), this is where
// we'll thread that in.

import os from "node:os";
import path from "node:path";
import process from "node:process";

export const defaultRoots = (): string[] => [
  path.join(process.cwd(), ".uix", "extensions"),
  path.join(os.homedir(), ".uix", "extensions"),
];
