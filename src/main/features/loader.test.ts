// Loader integration tests over real temp-dir workspaces: manifest
// reading/validation, jiti entry loading, FeatureDefinition validation,
// id policy, error isolation, ordering, and reload teardown all exercised
// through the public loadFeatures path.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import type { DocumentStoreFactory } from "@uix/api/documents";
import type { FeatureDefinition } from "@uix/api/feature";

import { AgentToolRegistry } from "../agent-tools/registry";
import { ChannelRegistry } from "../channels/registry";
import { DisposableBag } from "../lifecycle";

import { loadFeatures, type FeatureSubstrate } from "./loader";
import { WorkspaceManifestFileName } from "./manifest";

const documents: DocumentStoreFactory = {
  createStore: () => {
    throw new Error("unused in loader tests");
  },
};

function makeSubstrate() {
  const agentTools = new AgentToolRegistry();
  const channels = new ChannelRegistry({
    transportHandle: () => ({
      [Symbol.dispose]() {},
    }),
  });
  const substrate: FeatureSubstrate = {
    documents,
    channels,
    registries: { agentTools, channels },
  };
  return { substrate, agentTools };
}

/** In-memory stand-in for an in-tree bundled default. */
function bundledDefinition(id: string, tool = "snapshot"): FeatureDefinition {
  return {
    id,
    contribute: () => ({
      agentTools: [
        {
          name: tool,
          tool: {
            label: tool,
            description: "bundled test tool",
            parameters: Type.Object({}),
            execute: () => Promise.resolve({ content: [], details: {} }),
          },
        },
      ],
    }),
  };
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

  it("loads without a manifest (bundled only)", async () => {
    const { substrate, agentTools } = makeSubstrate();

    const result = await loadFeatures(
      { bundled: [bundledDefinition("canvas")] },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toEqual([]);
    expect(result.loaded.map((f) => f.id)).toEqual(["canvas"]);
    expect(agentTools.registeredContributions).toHaveLength(1);
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

  it("rejects reserved ids and ids already claimed by bundled features", async () => {
    const manifestPath = await writeWorkspace({
      "impostor.ts": toolFeature("agent"),
      "canvas-clone.ts": toolFeature("canvas"),
    });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath, bundled: [bundledDefinition("canvas")] },
      new DisposableBag(),
      substrate,
    );

    // Only the bundled canvas loads; both manifest entries fail.
    expect(result.loaded.map((f) => f.id)).toEqual(["canvas"]);
    const messages = result.failed.map((f) => f.error.message).sort();
    expect(messages[0]).toContain("already registered: canvas");
    expect(messages[1]).toContain("reserved: agent");
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

  it("activates bundled features before manifest entries, all torn down together", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    const result = await loadFeatures(
      { manifestPath, bundled: [bundledDefinition("canvas")] },
      bag,
      substrate,
    );

    expect(result.failed).toEqual([]);
    expect(result.loaded.map((f) => f.id)).toEqual(["canvas", "greeter"]);
    expect(result.loaded[0]?.entry).toBe("bundled:canvas");
    expect(agentTools.registeredContributions).toHaveLength(2);

    bag.clear();
    expect(agentTools.registeredContributions).toHaveLength(0);
  });

  it("isolates a throwing bundled feature without aborting the pass", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": toolFeature("greeter"),
    });
    const throwing: FeatureDefinition = {
      id: "explosive",
      contribute: () => {
        throw new Error("bundled boom");
      },
    };
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { manifestPath, bundled: [throwing] },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed[0]?.error.message).toContain("bundled boom");
    expect(result.loaded.map((f) => f.id)).toEqual(["greeter"]);
  });

  it("re-registers bundled + manifest features cleanly on reload", async () => {
    const manifestPath = await writeWorkspace({
      "greeter.ts": toolFeature("greeter"),
    });
    const sources = { manifestPath, bundled: [bundledDefinition("canvas")] };
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    await loadFeatures(sources, bag, substrate);
    const second = await loadFeatures(sources, bag, substrate);

    expect(second.failed).toEqual([]);
    expect(second.loaded.map((f) => f.id)).toEqual(["canvas", "greeter"]);
    expect(agentTools.registeredContributions).toHaveLength(2);
  });
});
