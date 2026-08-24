import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkspaceRegistry } from "./registry";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("workspace registry", () => {
  it("loads manifest-backed names and resolves relative manifest files", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Reference workspace");
    await writeRegistry(fixture.registryPath, [
      { id: "reference", manifest: "./uix.workspace.json" },
    ]);

    const registry = await loadWorkspaceRegistry(fixture.registryPath);

    expect(registry.list()).toMatchObject([
      {
        id: "reference",
        name: "Reference workspace",
        workspace: {
          stateRoot: fixture.root,
          agentCwd: fixture.root,
          manifestPath: join(fixture.root, "uix.workspace.json"),
        },
      },
    ]);
    expect(registry.require("reference")).toBe(registry.list()[0]);
  });

  it("rejects duplicate ids and non-manifest targets", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Reference workspace");
    await writeRegistry(fixture.registryPath, [
      { id: "reference", manifest: "./uix.workspace.json" },
      { id: "reference", manifest: "./uix.workspace.json" },
    ]);

    await expect(loadWorkspaceRegistry(fixture.registryPath)).rejects.toThrow(
      "Duplicate workspace id: reference",
    );

    await writeRegistry(fixture.registryPath, [
      { id: "reference", manifest: "./workspace.json" },
    ]);
    await expect(loadWorkspaceRegistry(fixture.registryPath)).rejects.toThrow(
      "must point to uix.workspace.json",
    );
  });

  it("keeps one boot snapshot and reflects edits only after another load", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Before restart");
    await writeRegistry(fixture.registryPath, [
      { id: "reference", manifest: "./uix.workspace.json" },
    ]);
    const before = await loadWorkspaceRegistry(fixture.registryPath);

    await writeManifest(fixture.root, "After restart");
    const after = await loadWorkspaceRegistry(fixture.registryPath);

    expect(before.list()[0]?.name).toBe("Before restart");
    expect(after.list()[0]?.name).toBe("After restart");
  });

  it("rejects an unknown id without revealing private registry coordinates", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Reference workspace");
    await writeRegistry(fixture.registryPath, [
      { id: "reference", manifest: "./uix.workspace.json" },
    ]);
    const registry = await loadWorkspaceRegistry(fixture.registryPath);

    let error: Error | undefined;
    try {
      registry.require("missing");
    } catch (thrown) {
      error = thrown instanceof Error ? thrown : new Error(String(thrown));
    }

    expect(error?.message).toBe("Unknown workspace: missing");
    expect(error?.message).not.toContain(fixture.root);
  });

  it("includes the minified registry schema when given a workspace manifest", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Reference workspace");

    let error: Error | undefined;
    try {
      await loadWorkspaceRegistry(join(fixture.root, "uix.workspace.json"));
    } catch (thrown) {
      error = thrown instanceof Error ? thrown : new Error(String(thrown));
    }

    expect(error?.message).toContain(
      "UIX_SERVER_REGISTRY points to a workspace manifest instead of a server registry",
    );
    expect(error?.message).toContain(
      'Expected example: {"version":1,"workspaces":[{"id":"workspace-id","manifest":"./uix.workspace.json"}]}',
    );
    expect(error?.message).toContain("Schema: {");
    expect(error?.message).not.toContain("\n");
  });

  it("rejects fields outside the private registry format", async () => {
    const fixture = await createFixture();
    await writeManifest(fixture.root, "Reference workspace");
    await writeFile(
      fixture.registryPath,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            id: "reference",
            manifest: "./uix.workspace.json",
            name: "Duplicated name",
          },
        ],
      }),
    );

    await expect(loadWorkspaceRegistry(fixture.registryPath)).rejects.toThrow(
      "Invalid server workspace registry",
    );
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly registryPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "server-registry-test-"));
  temporaryDirectories.push(root);
  return { root, registryPath: join(root, "server.workspaces.json") };
}

async function writeManifest(root: string, name: string): Promise<void> {
  await writeFile(
    join(root, "uix.workspace.json"),
    JSON.stringify({ name, features: [] }),
  );
}

async function writeRegistry(
  path: string,
  workspaces: ReadonlyArray<{ readonly id: string; readonly manifest: string }>,
): Promise<void> {
  await writeFile(path, JSON.stringify({ version: 1, workspaces }));
}
