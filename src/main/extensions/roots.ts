// Where the loader looks for Trellis extensions.
//
// Two scopes, mirroring pi's model:
//   - project: <cwd>/.trellis/extensions/*    (per-repo, the common case)
//   - global:  ~/.trellis/extensions/*        (cross-project, optional)
//
// Trellis itself ships zero extensions. The cockpit's own baseline
// agent configuration (orientation block, doc map, cockpit tools)
// is *embedded-pi config*, not an extension — handled separately
// when milestone 4 lands.
//
// `process.cwd()` is the right project anchor while we dogfood inside
// the trellis repo. When the cockpit grows a real "current project"
// concept (the user opening a directory), this is where we'll thread
// that in.

import os from "node:os";
import path from "node:path";

export interface ExtensionRoot {
  /** Short label for logs and diagnostics. */
  label: "project" | "global";
  /** Absolute path to the directory containing <package-name>/ subdirs. */
  dir: string;
}

export const defaultRoots = (): ExtensionRoot[] => [
  { label: "project", dir: path.join(process.cwd(), ".trellis", "extensions") },
  { label: "global", dir: path.join(os.homedir(), ".trellis", "extensions") },
];
