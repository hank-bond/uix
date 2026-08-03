import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WorkspaceManifestFileName } from "./manifest";
import { scaffoldWorkspace } from "./scaffold";

/** A fake bare-workspace template with one dependency-bearing tool feature. */
async function makeTemplates(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "uix-scaffold-templates-"));
  const featureDir = join(dir, "features", "pi-tools");
  await mkdir(join(featureDir, "node_modules", "junk"), { recursive: true });
  await writeFile(join(featureDir, "index.ts"), "export const feature = {};\n");
  await writeFile(join(featureDir, "read.ts"), "// editable tool\n");
  await writeFile(
    join(featureDir, "package.json"),
    `${JSON.stringify({
      name: "pi-tools",
      dependencies: { "@earendil-works/pi-coding-agent": "^0.82.0" },
    })}\n`,
  );
  return dir;
}

describe("scaffoldWorkspace", () => {
  it("copies templates, writes manifest refs and a workspaces package.json, and installs", async () => {
    const templatesDir = await makeTemplates();
    const workspaceDir = await mkdtemp(join(tmpdir(), "uix-scaffold-ws-"));
    const installedIn: string[] = [];

    const result = await scaffoldWorkspace({
      templatesDir,
      workspaceDir,
      name: "My Workspace",
      install: (dir) => {
        installedIn.push(dir);
        return Promise.resolve();
      },
    });

    expect(result.installError).toBeUndefined();
    expect(installedIn).toEqual([workspaceDir]);

    // Copies are complete (nested files included) and node_modules is skipped.
    await expect(
      readFile(join(workspaceDir, "features", "pi-tools", "read.ts"), "utf8"),
    ).resolves.toContain("editable tool");
    await expect(
      readFile(
        join(workspaceDir, "features", "pi-tools", "package.json"),
        "utf8",
      ),
    ).resolves.toContain("pi-coding-agent");
    await expect(
      stat(join(workspaceDir, "features", "pi-tools", "node_modules")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const manifest = JSON.parse(
      await readFile(join(workspaceDir, WorkspaceManifestFileName), "utf8"),
    ) as {
      name: string;
      features: Array<{ entry: string; settings: unknown }>;
    };
    expect(manifest.name).toBe("My Workspace");
    expect(manifest.features).toEqual([
      { entry: "./features/pi-tools/index.ts", settings: {} },
    ]);

    const rootPackage = JSON.parse(
      await readFile(join(workspaceDir, "package.json"), "utf8"),
    ) as { name: string; private: boolean; workspaces: string[] };
    expect(rootPackage).toMatchObject({
      name: "my-workspace",
      private: true,
      workspaces: ["features/*"],
    });
  });

  it("returns the install error instead of throwing; files are already in place", async () => {
    const templatesDir = await makeTemplates();
    const workspaceDir = await mkdtemp(join(tmpdir(), "uix-scaffold-ws-"));

    const result = await scaffoldWorkspace({
      templatesDir,
      workspaceDir,
      name: "ws",
      install: () => Promise.reject(new Error("npm exploded")),
    });

    expect(result.installError?.message).toBe("npm exploded");
    await expect(
      stat(join(workspaceDir, WorkspaceManifestFileName)),
    ).resolves.toBeDefined();
  });

  it("throws when a template dir is missing (picker surfaces it, no manifest written)", async () => {
    const templatesDir = await mkdtemp(join(tmpdir(), "uix-scaffold-empty-"));
    const workspaceDir = await mkdtemp(join(tmpdir(), "uix-scaffold-ws-"));

    await expect(
      scaffoldWorkspace({
        templatesDir,
        workspaceDir,
        name: "ws",
        install: () => Promise.resolve(),
      }),
    ).rejects.toThrow();
  });
});
