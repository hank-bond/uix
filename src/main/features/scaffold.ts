// create-new workspace scaffolding.
//
// Create-new copies the default feature templates (chat, canvas) into the new
// workspace and writes manifest references to the copies, so the workspace
// owns editable source from day one — editing `<ws>/features/canvas/` changes
// that workspace without touching the templates. Templates come from the
// repo's `src/features/` in dev; the packaged-binary `resourcesPath` half
// lands with the packaging arc.
//
// Feature deps are ordinary workspace deps, mirroring pi (whose loader
// aliases only its own packages plus typebox and leaves everything else to
// node_modules walk-up): a feature declares deps in its own `package.json`
// (inert to the loader — the manifest still points at entry files), the
// workspace root gets `workspaces: ["features/*"]`, and one `npm install` at
// scaffold time hoists them into `<ws>/node_modules` where walk-up resolution
// finds them. npm skips glob-matched dirs without a `package.json`, so
// dep-less features (chat) stay package-less. Install is scaffold-time only —
// never a startup step; later dep changes are the agent's/user's `npm
// install`, and a missing dep fails loudly into the loader's `failed[]`.
//
// Copy/write failures throw (the picker surfaces them and stays up); an
// install failure is returned instead, because the workspace is still
// openable — the dep-less features work and the broken one lands in
// `failed[]` naming the missing module.

import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { WorkspaceManifestFileName } from "./manifest";

/** Template dirs copied into every new workspace, in composition order. */
const DefaultFeatures = ["chat", "canvas"] as const;

export interface ScaffoldOptions {
  /** Directory holding the feature templates (repo `src/features/` in dev). */
  templatesDir: string;
  /** Workspace root to scaffold into (exists; has no manifest). */
  workspaceDir: string;
  /** Workspace name written to the manifest. */
  name: string;
  /** Dependency installer; defaults to `npm install` in the workspace. */
  install?: (workspaceDir: string) => Promise<void>;
}

export interface ScaffoldResult {
  /** Set when the dependency install failed; the workspace still opens. */
  installError?: Error;
}

const npmInstall = (workspaceDir: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: workspaceDir,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${String(code)}`));
    });
  });

/**
 * npm package names can't carry spaces/uppercase/most punctuation; the
 * workspace-root package.json is never published, so any readable slug does.
 */
const packageNameFor = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug || "uix-workspace";
};

export async function scaffoldWorkspace(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { templatesDir, workspaceDir, name } = options;
  const install = options.install ?? npmInstall;

  const featuresDir = path.join(workspaceDir, "features");
  await mkdir(featuresDir, { recursive: true });
  for (const feature of DefaultFeatures) {
    await cp(
      path.join(templatesDir, feature),
      path.join(featuresDir, feature),
      {
        recursive: true,
        filter: (src) => path.basename(src) !== "node_modules",
      },
    );
  }

  const manifest = {
    name,
    features: DefaultFeatures.map((feature) => ({
      id: feature,
      entry: `./features/${feature}/index.ts`,
      settings: {},
    })),
  };
  await writeFile(
    path.join(workspaceDir, WorkspaceManifestFileName),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const rootPackage = {
    name: packageNameFor(name),
    version: "0.0.0",
    private: true,
    workspaces: ["features/*"],
  };
  await writeFile(
    path.join(workspaceDir, "package.json"),
    `${JSON.stringify(rootPackage, null, 2)}\n`,
  );

  try {
    await install(workspaceDir);
  } catch (thrown) {
    const installError =
      thrown instanceof Error ? thrown : new Error(String(thrown));
    return { installError };
  }
  return {};
}
