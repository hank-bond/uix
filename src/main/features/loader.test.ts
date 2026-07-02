// Loader integration tests over real temp-dir packages: discovery, jiti
// entry loading, FeatureDefinition validation, id policy, error isolation,
// and reload teardown all exercised through the public loadFeatures path.

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "uix-loader-test-"));
}

/** Writes a feature package dir: package.json with uix.features + entries. */
async function writePackage(
  root: string,
  dirName: string,
  entries: Record<string, string>,
): Promise<void> {
  const dir = join(root, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: dirName,
      private: true,
      uix: { features: Object.keys(entries).map((f) => `./${f}`) },
    }),
  );
  for (const [file, source] of Object.entries(entries)) {
    await writeFile(join(dir, file), source);
  }
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
  it("loads a TS FeatureDefinition entry and registers its contributions", async () => {
    const root = await makeRoot();
    await writePackage(root, "greeter", {
      "feature.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    const result = await loadFeatures({ roots: [root] }, bag, substrate);

    expect(result.failed).toEqual([]);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]?.id).toBe("greeter");
    expect(agentTools.registeredContributions).toHaveLength(1);
    expect(agentTools.registeredContributions[0]?.canonicalId).toBe(
      "greeter__greet",
    );

    // Reload teardown: clearing the bag removes the contribution.
    bag.clear();
    expect(agentTools.registeredContributions).toHaveLength(0);
  });

  it("isolates a throwing entry and continues with siblings", async () => {
    const root = await makeRoot();
    // "aaa-broken" sorts before "greeter", so the failure comes first.
    await writePackage(root, "aaa-broken", {
      "feature.mjs": `throw new Error("deliberate canary");`,
    });
    await writePackage(root, "greeter", {
      "feature.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();

    const result = await loadFeatures(
      { roots: [root] },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error.message).toContain("deliberate canary");
    expect(result.loaded.map((f) => f.id)).toEqual(["greeter"]);
    expect(agentTools.registeredContributions).toHaveLength(1);
  });

  it("fails an entry whose default export is not a FeatureDefinition", async () => {
    const root = await makeRoot();
    await writePackage(root, "bad-shape", {
      "feature.mjs": `export default function activate() {};`,
    });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { roots: [root] },
      new DisposableBag(),
      substrate,
    );

    expect(result.loaded).toEqual([]);
    expect(result.failed[0]?.error.message).toContain(
      "not a FeatureDefinition",
    );
  });

  it("rejects reserved ids and ids already claimed by bundled features", async () => {
    const root = await makeRoot();
    await writePackage(root, "impostor", {
      "feature.ts": toolFeature("agent"),
    });
    await writePackage(root, "canvas-clone", {
      "feature.ts": toolFeature("canvas"),
    });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { roots: [root], bundled: [bundledDefinition("canvas")] },
      new DisposableBag(),
      substrate,
    );

    // Only the bundled canvas loads; both discovered entries fail.
    expect(result.loaded.map((f) => f.id)).toEqual(["canvas"]);
    const messages = result.failed.map((f) => f.error.message).sort();
    expect(messages[0]).toContain("already registered: canvas");
    expect(messages[1]).toContain("reserved: agent");
  });

  it("activates bundled features before discovered ones, all torn down together", async () => {
    const root = await makeRoot();
    await writePackage(root, "greeter", {
      "feature.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    const result = await loadFeatures(
      { roots: [root], bundled: [bundledDefinition("canvas")] },
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
    const root = await makeRoot();
    await writePackage(root, "greeter", {
      "feature.ts": toolFeature("greeter"),
    });
    const throwing: FeatureDefinition = {
      id: "explosive",
      contribute: () => {
        throw new Error("bundled boom");
      },
    };
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { roots: [root], bundled: [throwing] },
      new DisposableBag(),
      substrate,
    );

    expect(result.failed[0]?.error.message).toContain("bundled boom");
    expect(result.loaded.map((f) => f.id)).toEqual(["greeter"]);
  });

  it("rejects a duplicate id within the same pass", async () => {
    const root = await makeRoot();
    await writePackage(root, "first", { "feature.ts": toolFeature("dup") });
    await writePackage(root, "second", { "feature.ts": toolFeature("dup") });
    const { substrate } = makeSubstrate();

    const result = await loadFeatures(
      { roots: [root] },
      new DisposableBag(),
      substrate,
    );

    // Alphabetical package order: "first" wins, "second" fails.
    expect(result.loaded.map((f) => f.id)).toEqual(["dup"]);
    expect(result.failed[0]?.displayName).toBe("second");
    expect(result.failed[0]?.error.message).toContain(
      "already registered: dup",
    );
  });

  it("re-registers cleanly on reload without duplicate-id failures", async () => {
    const root = await makeRoot();
    await writePackage(root, "greeter", {
      "feature.ts": toolFeature("greeter"),
    });
    const { substrate, agentTools } = makeSubstrate();
    const bag = new DisposableBag();

    await loadFeatures({ roots: [root] }, bag, substrate);
    const second = await loadFeatures({ roots: [root] }, bag, substrate);

    expect(second.failed).toEqual([]);
    expect(second.loaded).toHaveLength(1);
    expect(agentTools.registeredContributions).toHaveLength(1);
  });
});
