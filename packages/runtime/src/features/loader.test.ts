import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { FeatureEventPublisherFactory } from "@uix/api/channels";
import type { DocumentStoreFactory } from "@uix/api/documents";

import { type FeatureSubstrate, loadFeatures } from "./loader";
import { WorkspaceManifestFileName } from "./manifest";
import { SurfaceRegistry } from "./surfaces";
import { ChannelRegistry } from "../channel-registry";
import { AsyncDisposableBag } from "../lifecycle";
import { WorkspaceManifestStore } from "../manifest-store";
import { ResourceRegistry } from "../resource-registry";

interface LoaderHarness {
  substrate: FeatureSubstrate;
  channels: ChannelRegistry;
  surfaces: SurfaceRegistry;
  settingsScopes: Map<
    string,
    { committed: boolean; values: Map<string, unknown> }
  >;
  committedSettings: string[];
}

const documents: DocumentStoreFactory = {
  createStore: () => {
    throw new Error("unused in loader tests");
  },
};

function makeSubstrate(manifestPath?: string): LoaderHarness {
  const manifestStore = manifestPath
    ? new WorkspaceManifestStore(manifestPath)
    : undefined;
  const settingsScopes = new Map<
    string,
    { committed: boolean; values: Map<string, unknown> }
  >();
  const committedSettings: string[] = [];
  const settings = {
    reload: async () => {
      if (!manifestStore || !manifestPath) {
        throw new Error("Test settings have no manifest path");
      }
      const next = await manifestStore.stageFromDisk();
      const { composition } = next;
      manifestStore.promote(next);
      settingsScopes.clear();
      return composition;
    },
    loadFeatureSettings: (featureId: string) => {
      if (settingsScopes.has(featureId)) {
        throw new Error(`Settings scope already registered: ${featureId}`);
      }
      const state = { committed: false, values: new Map<string, unknown>() };
      settingsScopes.set(featureId, state);
      let disposed = false;
      return {
        settings: {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- SettingsHandle.get infers T from the caller.
          get: <T = unknown>(key: string) =>
            settingsScopes.get(featureId)?.values.get(key) as T | undefined,
          set: (key: string, value: unknown) => {
            const scope = settingsScopes.get(featureId);
            if (!scope) throw new Error(`Unknown settings scope: ${featureId}`);
            scope.values.set(key, value);
          },
          onChange: () => () => {},
        },
        commit() {
          if (disposed || settingsScopes.get(featureId) !== state) {
            throw new Error(`Inactive settings scope: ${featureId}`);
          }
          if (state.committed) return;
          state.committed = true;
          committedSettings.push(featureId);
        },
        [Symbol.dispose]() {
          if (disposed) return;
          disposed = true;
          if (settingsScopes.get(featureId) === state) {
            settingsScopes.delete(featureId);
          }
        },
      };
    },
  };
  const channels = new ChannelRegistry();
  const surfaces = new SurfaceRegistry();
  const resources = new ResourceRegistry({ workspaceId: "test" });
  const substrate: FeatureSubstrate = {
    documents,
    settings,
    channels,
    registries: {
      resources,
      channels,
      invokeAgentChannel: (context, canonicalId, payload) =>
        context.agentInstanceGuard.value.featureChannels.invoke(
          canonicalId,
          payload,
        ),
      surfaces,
    },
    apiModuleDir: join(__dirname, "../../../api/src"),
  };
  return {
    substrate,
    channels,
    surfaces,
    settingsScopes,
    committedSettings,
  };
}

async function writeWorkspace(
  files: Record<string, string>,
  refs?: string[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "loader-test-"));
  for (const [file, source] of Object.entries(files)) {
    await writeFile(join(dir, file), source);
  }
  await writeFile(
    join(dir, WorkspaceManifestFileName),
    JSON.stringify({
      name: "test workspace",
      features: (refs ?? Object.keys(files).map((file) => `./${file}`)).map(
        (entry) => ({ entry, settings: {} }),
      ),
    }),
  );
  return join(dir, WorkspaceManifestFileName);
}

const featureSource = (id: string, request = "ping"): string => `
import { Type } from "typebox";

export const feature = {
  id: "${id}",
  workspace(ctx) {
    ctx.log.debug({}, "activated");
    return {
      channels: [{
        feature: "${id}",
        requests: {
          ${request}: {
            requestSchema: Type.Object({}),
            responseSchema: Type.String(),
            handler: () => "${id}",
          },
        },
        events: {},
      }],
    };
  },
  agent: () => ({ agentSystemPrompt: "${id}" }),
};
`;

const noEvents: FeatureEventPublisherFactory = {
  createPublisher: () => ({}) as never,
};

describe("loadFeatures", () => {
  it("runs the Workspace factory and retains the Agent factory", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": featureSource("greeter"),
    });
    const { substrate, channels, settingsScopes, committedSettings } =
      makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();

    const result = await loadFeatures({ manifestPath }, bag, substrate);

    expect(result.failed).toEqual([]);
    expect(result.activated[0]).toMatchObject({
      id: "greeter",
      displayName: "./greeter.ts",
    });
    expect(channels.listCanonicalIds()).toEqual(["greeter.ping"]);
    expect(
      result.activated[0]?.agent?.create(
        noEvents,
        new AsyncDisposableBag(),
        documents,
      ),
    ).toMatchObject({
      agentSystemPrompt: "greeter",
    });
    expect(settingsScopes.get("greeter")?.committed).toBe(true);
    expect(committedSettings).toEqual(["greeter"]);

    await bag.clear();
    expect(channels.listCanonicalIds()).toEqual([]);
    expect(settingsScopes.has("greeter")).toBe(false);
  });

  it("keeps manifest order for Workspace and Agent factories", async () => {
    const manifestPath = await writeWorkspace(
      {
        "aaa.ts": featureSource("aaa"),
        "zzz.ts": featureSource("zzz"),
      },
      ["./zzz.ts", "./aaa.ts"],
    );
    const { substrate, channels } = makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.activated.map(({ id }) => id)).toEqual(["zzz", "aaa"]);
    expect(result.activated.map(({ agent }) => agent?.id)).toEqual([
      "zzz",
      "aaa",
    ]);
    expect(channels.listCanonicalIds()).toEqual(["zzz.ping", "aaa.ping"]);
  });

  it("loads nothing without a manifest", async () => {
    const { substrate } = makeSubstrate();
    await expect(
      loadFeatures({}, new AsyncDisposableBag(), substrate),
    ).resolves.toEqual({ activated: [], failed: [] });
  });

  it("scopes concurrent loads to their feature bags", async () => {
    const firstManifest = await writeWorkspace({
      "first.ts": featureSource("first"),
    });
    const secondManifest = await writeWorkspace({
      "second.ts": featureSource("second"),
    });
    const first = makeSubstrate(firstManifest);
    const second = makeSubstrate(secondManifest);

    const [firstResult, secondResult] = await Promise.all([
      loadFeatures(
        { manifestPath: firstManifest },
        new AsyncDisposableBag(),
        first.substrate,
      ),
      loadFeatures(
        { manifestPath: secondManifest },
        new AsyncDisposableBag(),
        second.substrate,
      ),
    ]);

    expect(firstResult.activated.map(({ id }) => id)).toEqual(["first"]);
    expect(secondResult.activated.map(({ id }) => id)).toEqual(["second"]);
  });

  it("leaves active features intact when the manifest is malformed", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": featureSource("greeter"),
    });
    const { substrate, channels } = makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();
    await loadFeatures({ manifestPath }, bag, substrate);

    await writeFile(manifestPath, "{ not json");
    await expect(
      loadFeatures({ manifestPath }, bag, substrate),
    ).rejects.toThrow("not valid JSON");
    expect(channels.listCanonicalIds()).toEqual(["greeter.ping"]);
  });

  it("isolates a throwing entry and continues in manifest order", async () => {
    const manifestPath = await writeWorkspace(
      {
        "broken.mjs": `throw new Error("deliberate canary");`,
        "greeter.ts": featureSource("greeter"),
      },
      ["./broken.mjs", "./greeter.ts"],
    );
    const { substrate } = makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.failed[0]?.error.message).toContain("deliberate canary");
    expect(result.activated.map(({ id }) => id)).toEqual(["greeter"]);
  });

  it("rolls back settings when the Workspace factory throws", async () => {
    const manifestPath = await writeWorkspace({
      "broken.ts": `
export const feature = {
  id: "broken",
  workspace(ctx) {
    ctx.settings.set("enabled", true);
    throw new Error("workspace failed");
  },
};
`,
    });
    const { substrate, settingsScopes, committedSettings } =
      makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.failed[0]?.error.message).toContain("workspace failed");
    expect(settingsScopes.has("broken")).toBe(false);
    expect(committedSettings).toEqual([]);
  });

  it("awaits returned Workspace cleanup during replacement", async () => {
    const disposed = vi.fn();
    const manifestPath = await writeWorkspace({
      "clean.ts": `
export const feature = {
  id: "clean",
  workspace() {
    return {
      [Symbol.asyncDispose]: async () => globalThis.__featureDisposed(),
    };
  },
};
`,
    });
    Object.assign(globalThis, { __featureDisposed: disposed });
    const { substrate } = makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();

    await loadFeatures({ manifestPath }, bag, substrate);
    await loadFeatures({ manifestPath }, bag, substrate);

    expect(disposed).toHaveBeenCalledOnce();
    Reflect.deleteProperty(globalThis, "__featureDisposed");
  });

  it("activates Workspace replacements after old cleanup fails", async () => {
    const activated = vi.fn();
    const manifestPath = await writeWorkspace({
      "unclean.ts": `
export const feature = {
  id: "unclean",
  workspace() {
    globalThis.__featureActivated();
    return {
      [Symbol.asyncDispose]: () => Promise.reject(new Error("cleanup failed")),
    };
  },
};
`,
    });
    Object.assign(globalThis, { __featureActivated: activated });
    const { substrate } = makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();

    await loadFeatures({ manifestPath }, bag, substrate);
    const replacement = await loadFeatures({ manifestPath }, bag, substrate);

    expect(activated).toHaveBeenCalledTimes(2);
    expect(replacement.activated.map(({ id }) => id)).toEqual(["unclean"]);
    expect(replacement.cleanupErrors).toHaveLength(1);
    await expect(bag[Symbol.asyncDispose]()).rejects.toThrow("disposal failed");
    Reflect.deleteProperty(globalThis, "__featureActivated");
  });

  it("rejects invalid exports, reserved ids, and duplicate ids", async () => {
    const manifestPath = await writeWorkspace(
      {
        "bad.mjs": `export const feature = function nope() {};`,
        "reserved.ts": featureSource("agent"),
        "first.ts": featureSource("dup"),
        "second.ts": featureSource("dup"),
      },
      ["./bad.mjs", "./reserved.ts", "./first.ts", "./second.ts"],
    );
    const { substrate } = makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.activated.map(({ id }) => id)).toEqual(["dup"]);
    expect(result.failed.map(({ error }) => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not a FeatureDefinition"),
        expect.stringContaining("reserved: agent"),
        expect.stringContaining("already registered: dup"),
      ]),
    );
  });

  it("fails a missing ref without aborting later entries", async () => {
    const manifestPath = await writeWorkspace(
      { "greeter.ts": featureSource("greeter") },
      ["./missing.ts", "./greeter.ts"],
    );
    const { substrate } = makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.failed[0]?.displayName).toBe("./missing.ts");
    expect(result.activated.map(({ id }) => id)).toEqual(["greeter"]);
  });

  it("re-registers features cleanly on reload", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": featureSource("greeter"),
      "waver.ts": featureSource("waver", "wave"),
    });
    const { substrate, channels } = makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();

    await loadFeatures({ manifestPath }, bag, substrate);
    const second = await loadFeatures({ manifestPath }, bag, substrate);

    expect(second.failed).toEqual([]);
    expect(second.activated.map(({ id }) => id)).toEqual(["greeter", "waver"]);
    expect(channels.listCanonicalIds()).toEqual(["greeter.ping", "waver.wave"]);
  });

  it("resolves surfaces against the feature entry directory", async () => {
    const manifestPath = await writeWorkspace({
      "shiny.ts": `
export const feature = {
  id: "shiny",
  workspace: () => ({ surfaces: ["./workspace/surface.tsx"] }),
};
`,
    });
    const { substrate, surfaces } = makeSubstrate(manifestPath);
    const bag = new AsyncDisposableBag();

    const result = await loadFeatures({ manifestPath }, bag, substrate);
    const entryDir = join(result.activated[0]?.entry ?? "", "..");

    expect(surfaces.list()).toEqual([
      {
        featureId: "shiny",
        entry: join(entryDir, "workspace/surface.tsx"),
        featureRoot: entryDir,
      },
    ]);
    await bag.clear();
    expect(surfaces.list()).toEqual([]);
  });

  it("resolves @uix/api and typebox imports through loader aliases", async () => {
    const manifestPath = await writeWorkspace({
      "valuey.ts": `
import { withHandlers } from "@uix/api/channels";
import { Type } from "typebox";

const contract = {
  feature: "valuey",
  requests: {
    ping: {
      requestSchema: Type.Object({}),
      responseSchema: Type.Object({ ok: Type.Boolean() }),
    },
  },
  events: {},
};

export const feature = {
  id: "valuey",
  workspace: () => ({
    channels: [
      withHandlers(contract, { ping: { handler: () => ({ ok: true }) } }),
    ],
  }),
};
`,
    });
    const { substrate, channels } = makeSubstrate(manifestPath);

    const result = await loadFeatures(
      { manifestPath },
      new AsyncDisposableBag(),
      substrate,
    );

    expect(result.failed).toEqual([]);
    expect(channels.listCanonicalIds()).toContain("valuey.ping");
  });
});
