import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { KeybindingMap } from "@uix/api/actions";
import {
  defineSettings,
  type SettingsDefinition,
  type SettingsHandle,
} from "@uix/api/settings";
import { Type } from "typebox";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { keybindingsWorkspaceSettings } from "./keybindings/settings";
import {
  sessionWorkspaceSettings,
  type SelectedSessionSetting,
} from "./agent/session-settings";
import { SettingsRegistry } from "./settings-registry";
import { WorkspaceManifestStore } from "./workspace-manifest-store";
import {
  createWorkspaceSettings,
  type WorkspaceSettings,
} from "./workspace-settings";
import {
  defineWorkspaceSettingsNamespace,
  type WorkspaceSettingsNamespace,
} from "./workspace-settings-namespace";

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
const agentNamespace = defineWorkspaceSettingsNamespace({
  id: "agent",
  schema: Type.Object({
    defaultModel: Type.Optional(ModelRefSchema),
  }),
});

function statusSettings(defaultValue = StatusBarDefault): SettingsDefinition {
  return defineSettings({
    schema: Type.Object({ statusBar: StatusBarSchema }),
    default: { statusBar: defaultValue },
  });
}

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
  namespaces: readonly WorkspaceSettingsNamespace<
    string,
    SettingsDefinition
  >[] = [],
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

function activateFeatureSettings(
  settings: WorkspaceSettings,
  featureId: string,
  manifestIndex: number,
  definition: SettingsDefinition,
): SettingsHandle {
  const loaded = settings.loadFeatureSettings(
    featureId,
    manifestIndex,
    definition,
  );
  loaded.commit();
  return loaded.handle;
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());

    expect(chat.get("statusBar")).toEqual({
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

  it("discards provisional defaults and writes, then permits same-id recovery", async () => {
    const initialManifest = {
      name: "Demo",
      features: [{ entry: "./feature.ts" }],
    };
    const manifestPath = await tempManifest(initialManifest);
    using harness = createHarness(manifestPath);
    const { settings, manifest } = harness;

    await settings.reload();
    const failed = settings.loadFeatureSettings("chat", 0, statusSettings());
    failed.handle.set("statusBar", {
      order: ["context"],
      hidden: [],
    });

    await manifest.flush();
    expect(await readManifest(manifestPath)).toEqual(initialManifest);

    failed[Symbol.dispose]();
    expect(() => failed.handle.get("statusBar")).toThrow(
      "Unknown settings scope: chat",
    );

    const recovered = settings.loadFeatureSettings("chat", 0, statusSettings());
    recovered.commit();
    await manifest.flush();

    const written = (await readManifest(manifestPath)) as {
      features: { settings: Record<string, unknown> }[];
    };
    expect(written.features[0]?.settings).toEqual({
      statusBar: StatusBarDefault,
    });

    recovered[Symbol.dispose]();
    expect(() => recovered.handle.get("statusBar")).toThrow(
      "Unknown settings scope: chat",
    );
    expect(await readManifest(manifestPath)).toEqual(written);
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
    const { settings, manifest } = harness;

    await settings.reload();
    const chat = activateFeatureSettings(
      settings,
      "chat",
      0,
      statusSettings({
        order: ["new"],
        hidden: [],
        nested: { density: "compact" },
      }),
    );

    expect(chat.get("statusBar")).toEqual({
      order: ["old"],
      hidden: [],
      nested: { density: "cozy" },
    });

    await rm(path.dirname(manifestPath), { recursive: true, force: true });
    await expect(manifest.flush()).resolves.toBeUndefined();
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
      settings.loadFeatureSettings("chat", 0, statusSettings()),
    ).toThrow("Invalid settings for feature chat");
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
      settings.loadFeatureSettings(
        "chat",
        0,
        defineSettings({
          schema: Type.Object({
            enabled: Type.Boolean(),
            broken: Type.Boolean(),
          }),
          default: { enabled: true, broken: "yes" as unknown as boolean },
        }),
      ),
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());
    chat.set("statusBar", {
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());
    chat.onChange("statusBar", () => {
      throw new Error("listener failed");
    });

    expect(() =>
      chat.set("statusBar", {
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());
    await writeFile(manifestPath, "{ not json", "utf8");

    await expect(settings.reload()).rejects.toThrow("Expected property name");
    expect(chat.get("statusBar")).toEqual({
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
    const chat = activateFeatureSettings(settings, "chat", 0, statusSettings());
    chat.set("statusBar", {
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
    activateFeatureSettings(settings, "chat", 0, statusSettings());

    expect(chat.get("statusBar")).toEqual({
      order: ["thinking"],
      hidden: [],
      nested: { density: "normal" },
    });
  });
});

describe("workspace namespace settings", () => {
  it("hydrates a persisted namespace value through its descriptor", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        agent: { defaultModel: { provider: "anthropic", id: "claude" } },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);
    const { settings } = harness;

    await settings.reload();

    const agent = settings.forNamespace(agentNamespace);
    expectTypeOf(agent.get("defaultModel")).toEqualTypeOf<
      { provider: string; id: string } | undefined
    >();
    expect(agent.get("defaultModel")).toEqual({
      provider: "anthropic",
      id: "claude",
    });
  });

  it("materializes an empty namespace while optional values remain absent", async () => {
    const manifestContent = {
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    };
    const manifestPath = await tempManifest(manifestContent);
    using harness = createHarness(manifestPath, [agentNamespace]);
    const { settings, manifest } = harness;

    await settings.reload();
    expect(
      settings.forNamespace(agentNamespace).get("defaultModel"),
    ).toBeUndefined();

    await manifest.flush();

    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({ agent: {} });
  });

  it("persists namespace writes under the top-level settings object and notifies", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);
    const { settings, manifest, registry } = harness;
    const changes: unknown[] = [];
    const any: [string, string][] = [];

    await settings.reload();
    const agent = settings.forNamespace(agentNamespace);
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

  it("loads and persists the selected-session identity", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        session: {
          selected: {
            sessionId: "session-1",
          },
        },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, [sessionWorkspaceSettings]);
    const { settings, manifest } = harness;

    await settings.reload();
    const session = settings.forNamespace(sessionWorkspaceSettings);
    expectTypeOf(session.get("selected")).toEqualTypeOf<
      SelectedSessionSetting | undefined
    >();
    expect(session.get("selected")).toEqual({
      sessionId: "session-1",
    });

    session.set("selected", {
      sessionId: "session-2",
    });
    await manifest.flush();

    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({
      session: {
        selected: {
          sessionId: "session-2",
        },
      },
    });
  });

  it("materializes the empty keybindings namespace", async () => {
    const manifestPath = await tempManifest({ name: "Demo", features: [] });
    using harness = createHarness(manifestPath, [keybindingsWorkspaceSettings]);
    const { settings, manifest } = harness;

    await settings.reload();
    await manifest.flush();

    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({ keybindings: {} });
  });

  it("loads durable shortcuts and explicit unbinding", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        keybindings: {
          "chat.models.favorites": "mod+shift+m",
          "chat.models.all": null,
        },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, [keybindingsWorkspaceSettings]);
    const { settings } = harness;

    await settings.reload();
    const keybindings = settings.forNamespace(keybindingsWorkspaceSettings);
    expectTypeOf(keybindings.getSnapshot()).toEqualTypeOf<KeybindingMap>();
    expectTypeOf(keybindings.get("chat.models.favorites")).toEqualTypeOf<
      string | null | undefined
    >();

    expect(keybindings.get("chat.models.favorites")).toBe("mod+shift+m");
    expect(keybindings.get("chat.models.all")).toBeNull();
  });

  it.each([
    ["malformed action id", { "Chat.models": "mod+m" }],
    ["malformed shortcut", { "chat.models": "mod+mod+m" }],
  ])("rejects a %s while retaining the live bindings", async (_, candidate) => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: { keybindings: { "chat.models": "mod+m" } },
      features: [],
    });
    using harness = createHarness(manifestPath, [keybindingsWorkspaceSettings]);
    const { settings } = harness;

    await settings.reload();
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: "Demo",
          settings: { keybindings: candidate },
          features: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(settings.reload()).rejects.toThrow(
      "Invalid settings for workspace namespace keybindings",
    );
    expect(
      settings.forNamespace(keybindingsWorkspaceSettings).get("chat.models"),
    ).toBe("mod+m");
  });

  it("rejects unknown namespaces persisted under manifest settings", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: { rogue: {} },
      features: [],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);

    await expect(harness.settings.reload()).rejects.toThrow(
      "Unknown workspace settings namespace: rogue",
    );
  });

  it("rejects an empty workspace name at the manifest schema", async () => {
    const manifestPath = await tempManifest({ name: "", features: [] });
    using harness = createHarness(manifestPath);

    await expect(harness.settings.reload()).rejects.toThrow(
      "workspace manifest does not match schema",
    );
  });

  it("rejects non-object namespace values at the manifest schema", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: { agent: 5 },
      features: [],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);

    await expect(harness.settings.reload()).rejects.toThrow(
      "workspace manifest does not match schema",
    );
  });

  it("rejects a namespace descriptor that was not registered", async () => {
    const manifestPath = await tempManifest({ name: "Demo", features: [] });
    using harness = createHarness(manifestPath, [agentNamespace]);
    const otherAgentNamespace = defineWorkspaceSettingsNamespace({
      id: "agent",
      schema: Type.Object({ enabled: Type.Boolean() }),
    });

    expect(() => harness.settings.forNamespace(otherAgentNamespace)).toThrow(
      "Workspace settings namespace is not registered: agent",
    );
  });

  it("fails a feature whose id collides with a registered namespace", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);
    const { settings } = harness;

    await settings.reload();

    expect(() =>
      settings.loadFeatureSettings(
        "agent",
        0,
        defineSettings({ schema: Type.Object({}) }),
      ),
    ).toThrow("Settings scope already registered: agent");
  });

  it("rejects reload on a bad persisted namespace value, keeping memory intact", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      settings: {
        agent: { defaultModel: { provider: "anthropic", id: "claude" } },
      },
      features: [],
    });
    using harness = createHarness(manifestPath, [agentNamespace]);
    const { settings, manifest } = harness;

    await settings.reload();
    const agent = settings.forNamespace(agentNamespace);
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
    expect(agent.get("defaultModel")).toEqual({
      provider: "anthropic",
      id: "claude",
    });

    agent.set("defaultModel", {
      provider: "openai",
      id: "gpt",
    });
    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({
      agent: { defaultModel: { provider: "openai", id: "gpt" } },
    });
  });

  it("hydrates namespace defaults into the manifest when declared", async () => {
    const manifestPath = await tempManifest({ name: "Demo", features: [] });
    const thinkingNamespace = defineWorkspaceSettingsNamespace({
      id: "agent",
      schema: Type.Object({ thinking: Type.String() }),
      default: { thinking: "medium" },
    });
    using harness = createHarness(manifestPath, [thinkingNamespace]);
    const { settings, manifest } = harness;

    await settings.reload();
    expect(settings.forNamespace(thinkingNamespace).get("thinking")).toBe(
      "medium",
    );

    await manifest.flush();
    const written = (await readManifest(manifestPath)) as {
      settings: Record<string, unknown>;
    };
    expect(written.settings).toEqual({ agent: { thinking: "medium" } });
  });
});
