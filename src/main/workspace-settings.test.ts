import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SettingDefinitions } from "@uix/api/settings";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";

import { SettingsRegistry } from "./settings-registry";
import { WorkspaceManifestStore } from "./workspace-manifest-store";
import {
  createWorkspaceSettings,
  type WorkspaceSettings,
} from "./workspace-settings";

const roots: string[] = [];

const StatusBarSchema = Type.Object({
  order: Type.Array(Type.String()),
  hidden: Type.Array(Type.String()),
  nested: Type.Optional(
    Type.Object({
      density: Type.String(),
    }),
  ),
});
const StatusBarDefault = {
  order: ["model", "context"],
  hidden: [],
  nested: { density: "normal" },
};

const ModelRefSchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
});
const agentNamespace: SettingDefinitions = {
  defaultModel: { schema: ModelRefSchema },
};

async function tempManifest(content: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uix-settings-test-"));
  roots.push(root);
  const manifestPath = path.join(root, "uix.workspace.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
  return manifestPath;
}

interface Harness extends Disposable {
  manifest: WorkspaceManifestStore;
  registry: SettingsRegistry;
  settings: WorkspaceSettings;
}

function createHarness(
  manifestPath: string,
  namespaces: Record<string, SettingDefinitions> = {},
): Harness {
  const manifest = new WorkspaceManifestStore(manifestPath, {
    flushDebounceMs: 1000,
  });
  const registry = new SettingsRegistry();
  return {
    manifest,
    registry,
    settings: createWorkspaceSettings(manifest, registry, namespaces),
    [Symbol.dispose]() {
      manifest[Symbol.dispose]();
      registry[Symbol.dispose]();
    },
  };
}

async function readManifest(manifestPath: string): Promise<unknown> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("feature settings", () => {
  it("hydrates missing object fields from explicit feature defaults", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: { statusBar: { hidden: ["context"] } },
        },
      ],
    });
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });

    expect(settings.forScope("chat").get("statusBar")).toEqual({
      order: ["model", "context"],
      hidden: ["context"],
      nested: { density: "normal" },
    });

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      features: { settings: Record<string, unknown> }[];
    };
    expect(written.features[0]?.settings).toEqual({
      statusBar: {
        order: ["model", "context"],
        hidden: ["context"],
        nested: { density: "normal" },
      },
    });
  });

  it("does not overwrite persisted values when defaults change", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: {
            statusBar: {
              order: ["old"],
              hidden: [],
              nested: { density: "cozy" },
            },
          },
        },
      ],
    });
    using harness = createHarness(manifestPath);
    const { settings } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: {
        schema: StatusBarSchema,
        default: {
          order: ["new"],
          hidden: [],
          nested: { density: "compact" },
        },
      },
    });

    expect(settings.forScope("chat").get("statusBar")).toEqual({
      order: ["old"],
      hidden: [],
      nested: { density: "cozy" },
    });
  });

  it("rejects unknown persisted setting keys", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: { stale: true },
        },
      ],
    });
    using harness = createHarness(manifestPath);
    const { settings } = harness;

    await settings.reload();
    expect(() =>
      settings.loadFeatureScope("chat", 0, {
        statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
      }),
    ).toThrow("Unknown setting for feature chat: stale");
  });

  it("does not commit manifest changes when hydration fails", async () => {
    const manifestContent = {
      name: "Demo",
      features: [{ entry: "./feature.ts" }],
    };
    const manifestPath = await tempManifest(manifestContent);
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;

    await settings.reload();
    expect(() =>
      settings.loadFeatureScope("chat", 0, {
        enabled: { schema: Type.Boolean(), default: true },
        broken: { schema: Type.Boolean(), default: "yes" },
      }),
    ).toThrow();

    await manifest.flush();
    expect(await readManifest(manifestPath)).toEqual(manifestContent);
  });

  it("updates memory immediately, validates set values, and flushes feature-local settings", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        { entry: "./feature.ts", settings: {} },
        { entry: "./canvas.ts", settings: { zoom: 2 } },
      ],
      unknown: { preserved: true },
    });
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;
    const changes: unknown[] = [];

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    const chat = settings.forScope("chat");
    chat.onChange("statusBar", (value) => changes.push(value));

    chat.set("statusBar", { order: ["model"], hidden: ["context"] });

    expect(chat.get("statusBar")).toEqual({
      order: ["model"],
      hidden: ["context"],
    });
    expect(changes).toEqual([{ order: ["model"], hidden: ["context"] }]);
    expect(() => chat.set("statusBar", { order: [1], hidden: [] })).toThrow();

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      unknown: unknown;
      features: { entry: string; settings: Record<string, unknown> }[];
    };

    expect(written.unknown).toEqual({ preserved: true });
    expect(written.features).toEqual([
      {
        entry: "./feature.ts",
        settings: { statusBar: { order: ["model"], hidden: ["context"] } },
      },
      { entry: "./canvas.ts", settings: { zoom: 2 } },
    ]);
  });

  it("keeps dirty settings after a failed flush", async () => {
    const initialManifest = {
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    };
    const manifestPath = await tempManifest(initialManifest);
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    settings.forScope("chat").set("statusBar", {
      order: ["model"],
      hidden: [],
    });

    const root = path.dirname(manifestPath);
    await rm(root, { recursive: true, force: true });
    await expect(manifest.flush()).rejects.toThrow();

    await mkdir(root, { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify(initialManifest, null, 2)}\n`,
      "utf8",
    );
    await manifest.flush();

    const written = (await readManifest(manifestPath)) as {
      features: { settings: Record<string, unknown> }[];
    };
    expect(written.features[0]?.settings).toEqual({
      statusBar: { order: ["model"], hidden: [] },
    });
  });

  it("schedules persistence before notifying change listeners", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    });
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    settings.forScope("chat").onChange("statusBar", () => {
      throw new Error("listener failed");
    });

    expect(() =>
      settings.forScope("chat").set("statusBar", {
        order: ["model"],
        hidden: [],
      }),
    ).toThrow("listener failed");

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      features: { settings: Record<string, unknown> }[];
    };
    expect(written.features[0]?.settings).toEqual({
      statusBar: { order: ["model"], hidden: [] },
    });
  });

  it("reload failure leaves the current in-memory settings intact", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: { statusBar: { order: ["model"], hidden: [] } },
        },
      ],
    });
    using harness = createHarness(manifestPath);
    const { settings } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    await writeFile(manifestPath, "{ not json", "utf8");

    await expect(settings.reload()).rejects.toThrow("Expected property name");
    expect(settings.forScope("chat").get("statusBar")).toEqual({
      order: ["model"],
      hidden: [],
      nested: { density: "normal" },
    });
  });

  it("reload discards pending memory and reads disk", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: { statusBar: { order: ["model"], hidden: [] } },
        },
      ],
    });
    using harness = createHarness(manifestPath);
    const { settings } = harness;

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    settings.forScope("chat").set("statusBar", {
      order: ["context"],
      hidden: [],
    });
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: "Demo",
          features: [
            {
              entry: "./feature.ts",
              settings: { statusBar: { order: ["thinking"], hidden: [] } },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await settings.reload();
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });

    expect(settings.forScope("chat").get("statusBar")).toEqual({
      order: ["thinking"],
      hidden: [],
      nested: { density: "normal" },
    });
  });
});

describe("workspace namespace settings", () => {
  it("hydrates a persisted namespace value readable via forScope", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        agent: { defaultModel: { provider: "anthropic", id: "claude" } },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, { agent: agentNamespace });
    const { settings } = harness;

    await settings.reload();

    expect(settings.forScope("agent").get("defaultModel")).toEqual({
      provider: "anthropic",
      id: "claude",
    });
  });

  it("reads optional absent settings as undefined without growing the manifest", async () => {
    const manifestContent = {
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    };
    const manifestPath = await tempManifest(manifestContent);
    using harness = createHarness(manifestPath, { agent: agentNamespace });
    const { settings, manifest } = harness;

    await settings.reload();
    expect(settings.forScope("agent").get("defaultModel")).toBeUndefined();

    // Force a flush via an unrelated feature write; no `settings` block
    // may appear at the manifest top level.
    settings.loadFeatureScope("chat", 0, {
      statusBar: { schema: StatusBarSchema, default: StatusBarDefault },
    });
    await manifest.flush();

    const written = (await readManifest(manifestPath)) as Record<
      string,
      unknown
    >;
    expect("settings" in written).toBe(false);
  });

  it("persists namespace writes under the top-level settings object and notifies", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [],
    });
    using harness = createHarness(manifestPath, { agent: agentNamespace });
    const { settings, manifest, registry } = harness;
    const changes: unknown[] = [];
    const any: [string, string][] = [];

    await settings.reload();
    const agent = settings.forScope("agent");
    agent.onChange("defaultModel", (value) => changes.push(value));
    registry.onAnyChange((scopeId, key) => any.push([scopeId, key]));

    agent.set("defaultModel", { provider: "anthropic", id: "claude" });

    expect(changes).toEqual([{ provider: "anthropic", id: "claude" }]);
    expect(any).toEqual([["agent", "defaultModel"]]);

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({
      agent: { defaultModel: { provider: "anthropic", id: "claude" } },
    });
  });

  it("rejects unknown namespaces persisted under manifest settings", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: { rogue: {} },
      features: [],
    });
    using harness = createHarness(manifestPath, { agent: agentNamespace });

    await expect(harness.settings.reload()).rejects.toThrow(
      "Unknown workspace settings namespace: rogue",
    );
  });

  it("throws on first use of an unknown scope handle", async () => {
    const manifestPath = await tempManifest({ name: "Demo", features: [] });
    using harness = createHarness(manifestPath, { agent: agentNamespace });

    await harness.settings.reload();

    // Handles are lazy — minting succeeds, first use throws.
    const rogue = harness.settings.forScope("rogue");
    expect(() => rogue.get("anything")).toThrow(
      "Unknown settings scope: rogue",
    );
  });

  it("fails a feature whose id collides with a registered namespace", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    });
    using harness = createHarness(manifestPath, { agent: agentNamespace });
    const { settings } = harness;

    await settings.reload();

    expect(() => settings.loadFeatureScope("agent", 0, {})).toThrow(
      "Settings scope already registered: agent",
    );
  });

  it("rejects reload on a bad persisted namespace value, keeping memory intact", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        agent: { defaultModel: { provider: "anthropic", id: "claude" } },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, { agent: agentNamespace });
    const { settings } = harness;

    await settings.reload();
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: "Demo",
          settings: { agent: { defaultModel: 5 } },
          features: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(settings.reload()).rejects.toThrow();
    expect(settings.forScope("agent").get("defaultModel")).toEqual({
      provider: "anthropic",
      id: "claude",
    });
  });

  it("hydrates namespace defaults into the manifest when declared", async () => {
    const manifestPath = await tempManifest({ name: "Demo", features: [] });
    using harness = createHarness(manifestPath, {
      agent: {
        thinking: { schema: Type.String(), default: "medium" },
      },
    });
    const { settings, manifest } = harness;

    await settings.reload();
    expect(settings.forScope("agent").get("thinking")).toBe("medium");

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({ agent: { thinking: "medium" } });
  });
});
