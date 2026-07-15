import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceManifestStore } from "./workspace-manifest-store";

const roots: string[] = [];

async function createManifest(content: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uix-manifest-store-test-"));
  roots.push(root);
  const manifestPath = path.join(root, "uix.workspace.json");
  await writeFile(manifestPath, `${JSON.stringify(content, null, 2)}\n`);
  return manifestPath;
}

async function readManifest(manifestPath: string): Promise<unknown> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("WorkspaceManifestStore generations", () => {
  it("keeps staged writes detached until promotion", async () => {
    const original = {
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: { enabled: false } }],
    };
    const manifestPath = await createManifest(original);
    using store = new WorkspaceManifestStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    const next = await store.stageFromDisk();
    next.featureEntrySettings(0).write({ enabled: true });

    expect(await readManifest(manifestPath)).toEqual(original);
    expect(() => store.featureEntrySettings(0)).toThrow(
      "WorkspaceManifestStore has no active manifest",
    );

    store.promote(next);
    expect(store.featureEntrySettings(0).read()).toEqual({ enabled: true });

    await store.flush();
    expect(await readManifest(manifestPath)).toEqual({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: { enabled: true } }],
    });
  });

  it("rejects structurally invalid disk data before staging", async () => {
    const manifestPath = await createManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: { enabled: true } }],
    });
    using store = new WorkspaceManifestStore(manifestPath);
    const active = await store.stageFromDisk();
    store.promote(active);

    await writeFile(
      manifestPath,
      `${JSON.stringify({ name: "Broken", features: "invalid" })}\n`,
    );

    await expect(store.stageFromDisk()).rejects.toThrow(
      "workspace manifest does not match schema",
    );
    expect(store.featureEntrySettings(0).read()).toEqual({ enabled: true });
  });

  it("allows newer staged generations in order and rejects stale writes", async () => {
    const manifestPath = await createManifest({
      name: "First",
      features: [{ entry: "./first.ts" }],
    });
    using store = new WorkspaceManifestStore(manifestPath);

    const first = await store.stageFromDisk();
    const firstLocation = first.featureEntrySettings(0);
    store.promote(first);

    await writeFile(
      manifestPath,
      `${JSON.stringify({
        name: "Second",
        features: [{ entry: "./second.ts" }],
      })}\n`,
    );
    const second = await store.stageFromDisk();
    store.promote(second);

    expect(second.composition.manifest.name).toBe("Second");
    expect(() => firstLocation.write({})).toThrow(
      "Workspace manifest generation is stale",
    );
    expect(() => store.promote(first)).toThrow(
      "Workspace manifest is already stale",
    );
  });

  it("rejects generations staged by another store", async () => {
    const manifestPath = await createManifest({
      name: "Demo",
      features: [],
    });
    using first = new WorkspaceManifestStore(manifestPath);
    using second = new WorkspaceManifestStore(manifestPath);

    const staged = await first.stageFromDisk();

    expect(() => second.promote(staged)).toThrow(
      "Workspace manifest was not staged by this store",
    );
  });
});
