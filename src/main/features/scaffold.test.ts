import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WorkspaceManifestFileName } from "./manifest";
import { scaffoldWorkspace } from "./scaffold";

/** A fake templates dir shaped like src/features/: chat dep-less, canvas with deps. */
async function makeTemplates(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "uix-scaffold-templates-"));
  await mkdir(join(dir, "chat", "workspace"), { recursive: true });
  await writeFile(join(dir, "chat", "index.ts"), "export default {};\n");
  await writeFile(join(dir, "chat", "workspace", "surface.tsx"), "// ui\n");
  await mkdir(join(dir, "canvas", "node_modules", "junk"), { recursive: true });
  await writeFile(join(dir, "canvas", "index.ts"), "export default {};\n");
  await writeFile(
    join(dir, "canvas", "package.json"),
    `${JSON.stringify({ name: "canvas", dependencies: { parse5: "^8.0.1" } })}\n`,
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
      readFile(
        join(workspaceDir, "features", "chat", "workspace", "surface.tsx"),
        "utf8",
      ),
    ).resolves.toContain("ui");
    await expect(
      readFile(
        join(workspaceDir, "features", "canvas", "package.json"),
        "utf8",
      ),
    ).resolves.toContain("parse5");
    await expect(
      stat(join(workspaceDir, "features", "canvas", "node_modules")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const manifest = JSON.parse(
      await readFile(join(workspaceDir, WorkspaceManifestFileName), "utf8"),
    ) as { name: string; features: string[] };
    expect(manifest.name).toBe("My Workspace");
    expect(manifest.features).toEqual([
      "./features/chat/index.ts",
      "./features/canvas/index.ts",
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
