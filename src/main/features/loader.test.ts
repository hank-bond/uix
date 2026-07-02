// Loader integration tests over real temp-dir workspaces: manifest
// reading/validation, jiti entry loading, FeatureDefinition validation,
// id policy, error isolation, ordering, and reload teardown all exercised
// through the public loadFeatures path.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DocumentStoreFactory } from "@uix/api/documents";

import { AgentToolRegistry } from "../agent-tools/registry";
import { ChannelRegistry } from "../channels/registry";
import { DisposableBag } from "../lifecycle";

import { loadFeatures, type FeatureSubstrate } from "./loader";
import { WorkspaceManifestFileName } from "./manifest";
import { SurfaceRegistry } from "./surfaces";

const documents: DocumentStoreFactory = {
  createStore: () => {
    throw new Error("unused in loader tests");
  },
};

function makeSubstrate() {
  const agentTools = new AgentToolRegistry();
  const surfaces = new SurfaceRegistry();
  const channelIds = new Set<string>();
  const channels = new ChannelRegistry({
    transportHandle: (canonicalId) => {
      channelIds.add(canonicalId);
      return {
        [Symbol.dispose]() {
          channelIds.delete(canonicalId);
        },
      };
    },
  });
  const substrate: FeatureSubstrate = {
    documents,
    channels,
    registries: { agentTools, channels, surfaces },
    // The repo's API source — what the composition root supplies in dev.
    apiModuleDir: join(__dirname, "../../api"),
  };
  return { substrate, agentTools, surfaces, channelIds };
}

/**
 * Writes a workspace: the given feature files plus a manifest whose
 * `features` array lists `refs` (defaulting to every written file, in
 * insertion order).
 */
async function writeWorkspace(
  files: Record<string, string>,
  refs?: string[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "uix-loader-test-"));
  for (const [file, source] of Object.entries(files)) {
    await writeFile(join(dir, file), source);
  }
  await writeFile(
    join(dir, WorkspaceManifestFileName),
    JSON.stringify({
      name: "test workspace",
      features: refs ?? Object.keys(files).map((f) => `./${f}`),
    }),
  );
  return join(dir, WorkspaceManifestFileName);
}

const toolFeature = (id: string, tool = "greet") => `
const feature = {
  id: "${id}",
  contribute(ctx) {
    ctx.log.debug({}, "activated");
    return {
      agentTools: [
        {
          name: "${tool}",
          tool: {
            label: "${tool}",
            description: "test tool",
            parameters: { type: "object", properties: {} },
            execute: async () => ({ content: [], details: {} }),
          },
        },
      ],
    };
  },
};
export default feature;
`;

describe("loadFeatures", () => {
  it("loads a TS entry straight from a manifest ref and registers its contributions", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    const result = await loadFeatures({ manifestPath }, bag, substrate);

    expect(result.failed).toEqual([]);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]?.id).toBe("greeter");
    expect(result.loaded[0]?.displayName).toBe("./greeter.ts");
    expect(agentTools.registeredContributions[0]?.canonicalId).toBe(
      "greeter__greet",
    );

    // Reload teardown: clearing the bag removes the contribution.
    bag.clear();
    expect(agentTools.registeredContributions).toHaveLength(0);
  });

  it("registers in manifest order, not filesystem order", async () => {
    const manifestPath = await writeWorkspace(
      {
        "aaa.ts": toolFeature("aaa"),
        "zzz.ts": toolFeature("zzz"),
      },
      ["./zzz.ts", "./aaa.ts"],
    );
    const { substrate, agentTools } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.loaded.map((f) => f.id)).toEqual(["zzz", "aaa"]);
    expect(
      agentTools.registeredContributions.map((c) => c.canonicalId),
    ).toEqual(["zzz__greet", "aaa__greet"]);
  });

  it("loads nothing without a manifest", async () => {
    const { substrate, agentTools } = makeSubstrate();

    const result = await loadFeatures({}, new DisposableBag(), substrate);

    expect(result.failed).toEqual([]);
    expect(result.loaded).toEqual([]);
    expect(agentTools.registeredContributions).toHaveLength(0);
  });

  it("rejects a malformed manifest and leaves the current tree intact", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    await loadFeatures({ manifestPath }, bag, substrate);
    expect(agentTools.registeredContributions).toHaveLength(1);

    await writeFile(manifestPath, "{ not json");
    await expect(
      loadFeatures({ manifestPath }, bag, substrate),
    ).rejects.toThrow("not valid JSON");
    // The failed pass never cleared the bag: the feature is still live.
    expect(agentTools.registeredContributions).toHaveLength(1);

    await writeFile(manifestPath, JSON.stringify({ features: "nope" }));
    await expect(
      loadFeatures({ manifestPath }, bag, substrate),
    ).rejects.toThrow("does not match schema");
    expect(agentTools.registeredContributions).toHaveLength(1);
  });

  it("isolates a throwing entry and continues with later manifest lines", async () => {
    const manifestPath = await writeWorkspace(
      {
        "broken.mjs": `throw new Error("deliberate canary");`,
        "greeter.ts": toolFeature("greeter"),
      },
      ["./broken.mjs", "./greeter.ts"],
    );
    const { substrate, agentTools } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error.message).toContain("deliberate canary");
    expect(result.loaded.map((f) => f.id)).toEqual(["greeter"]);
    expect(agentTools.registeredContributions).toHaveLength(1);
  });

  it("fails a ref whose file is missing without aborting the pass", async () => {
    const manifestPath = await writeWorkspace(
      { "greeter.ts": toolFeature("greeter") },
      ["./missing.ts", "./greeter.ts"],
    );
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.displayName).toBe("./missing.ts");
    expect(result.loaded.map((f) => f.id)).toEqual(["greeter"]);
  });

  it("resolves absolute refs outside the workspace dir", async () => {
    const sharedDir = await mkdtemp(join(tmpdir(), "uix-shared-feature-"));
    const sharedEntry = join(sharedDir, "shared.ts");
    await writeFile(sharedEntry, toolFeature("shared"));
    const manifestPath = await writeWorkspace({}, [sharedEntry]);
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toEqual([]);
    expect(result.loaded.map((f) => f.id)).toEqual(["shared"]);
    expect(result.loaded[0]?.entry).toBe(sharedEntry);
  });

  it("fails an entry whose default export is not a FeatureDefinition", async () => {
    const manifestPath = await writeWorkspace({
      "bad.mjs": `export default function activate() {};`,
    });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.loaded).toEqual([]);
    expect(result.failed[0]?.error.message).toContain(
      "not a FeatureDefinition",
    );
  });

  it("rejects reserved ids", async () => {
    const manifestPath = await writeWorkspace({
      "impostor.ts": toolFeature("agent"),
      "impostor2.ts": toolFeature("uix"),
    });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.loaded).toEqual([]);
    const messages = result.failed.map((f) => f.error.message).sort();
    expect(messages[0]).toContain("reserved: agent");
    expect(messages[1]).toContain("reserved: uix");
  });

  it("rejects a duplicate id within the same pass", async () => {
    const manifestPath = await writeWorkspace(
      {
        "first.ts": toolFeature("dup"),
        "second.ts": toolFeature("dup"),
      },
      ["./first.ts", "./second.ts"],
    );
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    // Manifest order: the first line wins, the second fails.
    expect(result.loaded.map((f) => f.id)).toEqual(["dup"]);
    expect(result.failed[0]?.displayName).toBe("./second.ts");
    expect(result.failed[0]?.error.message).toContain(
      "already registered: dup",
    );
  });

  it("re-registers manifest features cleanly on reload", async () => {
    const manifestPath = await writeWorkspace(
      {
        "greeter.ts": toolFeature("greeter"),
        "waver.ts": toolFeature("waver", "wave"),
      },
      ["./greeter.ts", "./waver.ts"],
    );
    const sources = { manifestPath };
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    await loadFeatures(sources, bag, substrate);
    const second = await loadFeatures(sources, bag, substrate);

    expect(second.failed).toEqual([]);
    expect(second.loaded.map((f) => f.id)).toEqual(["greeter", "waver"]);
    expect(agentTools.registeredContributions).toHaveLength(2);
  });

  it("registers surface refs resolved against the feature entry's directory", async () => {
    const manifestPath = await writeWorkspace({
      "shiny.ts": `
export default {
  id: "shiny",
  contribute: () => ({ surfaces: ["./workspace/surface.tsx"] }),
};
`,
    });
    const { substrate, surfaces } = makeSubstrate();
    const bag = new DisposableBag();

    const result = await loadFeatures({ manifestPath }, bag, substrate);

    expect(result.failed).toEqual([]);
    const entryDir = join(result.loaded[0]?.entry ?? "", "..");
    expect(surfaces.list()).toEqual([
      {
        featureId: "shiny",
        entry: join(entryDir, "workspace/surface.tsx"),
        featureRoot: entryDir,
      },
    ]);

    bag.clear();
    expect(surfaces.list()).toEqual([]);
  });

  it("resolves @uix/api and typebox value imports through the loader aliases", async () => {
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

export default {
  id: "valuey",
  contribute: () => ({
    channels: [withHandlers(contract, { ping: { handle: () => ({ ok: true }) } })],
  }),
};
`,
    });
    const { substrate, channelIds } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toEqual([]);
    expect(result.loaded.map((f) => f.id)).toEqual(["valuey"]);
    expect([...channelIds]).toContain("valuey.ping");
  });
});
