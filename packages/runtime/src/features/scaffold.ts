// Creates a bare editable workspace from feature templates without discarding it when dependency installation fails.
//
// Feature package files are optional npm dependency metadata. The manifest
// remains the only composition authority. One install during scaffolding makes
// dependencies available through normal node_modules walk-up. Later dependency
// changes remain explicit workspace package operations rather than startup
// behavior.

import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { WorkspaceManifestFileName } from "./manifest";

/** Template feature dirs copied into every new workspace, in composition order. */
const DefaultFeatures = ["pi-tools"] as const;

export interface ScaffoldOptions {
  /** Bare workspace template root (repo `templates/workspace/` in dev). */
  templatesDir: string;
  /** Workspace root to scaffold into (exists. Has no manifest). */
  workspaceDir: string;
  /** Workspace name written to the manifest. */
  name: string;
  /** Dependency installer. Defaults to `npm install` in the workspace. */
  install?: (workspaceDir: string) => Promise<void>;
}

export interface ScaffoldResult {
  /** Set when the dependency install failed. The workspace still opens. */
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
 * npm package names can't contain spaces/uppercase/most punctuation. The
 * workspace-root package.json is never published, so any readable slug does.
 */
const packageNameFor = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug || "uix-workspace";
};

/**
 * Copy editable feature templates and write their manifest and npm workspace.
 *
 * Copy and write failures throw. Dependency-install failures return in the
 * result because the created workspace remains openable.
 */
export async function scaffoldWorkspace(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { templatesDir, workspaceDir, name } = options;
  const install = options.install ?? npmInstall;

  const featuresDir = path.join(workspaceDir, "features");
  await mkdir(featuresDir, { recursive: true });
  for (const feature of DefaultFeatures) {
    await cp(
      path.join(templatesDir, "features", feature),
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
