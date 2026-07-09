import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";

import { DisposableBag } from "./lifecycle";
import {
  bindFeatureSettingsStore,
  WorkspaceSettingsStore,
} from "./workspace-settings-store";

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

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("WorkspaceSettingsStore", () => {
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["model", "context"],
        hidden: ["context"],
        nested: { density: "normal" },
      });

      await settings.flush();
      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        features: Array<{ settings: Record<string, unknown> }>;
      };
      expect(written.features[0]?.settings).toEqual({
        statusBar: {
          order: ["model", "context"],
          hidden: ["context"],
          nested: { density: "normal" },
        },
      });
    } finally {
      settings[Symbol.dispose]();
    }
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: {
            order: ["new"],
            hidden: [],
            nested: { density: "compact" },
          },
        },
      });

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["old"],
        hidden: [],
        nested: { density: "cozy" },
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("hydrates scalar defaults and treats null as an explicit value", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          entry: "./feature.ts",
          settings: { selected: null },
        },
      ],
    });
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        enabled: { schema: Type.Boolean(), default: true },
        selected: {
          schema: Type.Union([Type.String(), Type.Null()]),
          default: "main",
        },
      });

      expect(settings.forFeature("chat").get("enabled")).toBe(true);
      expect(settings.forFeature("chat").get("selected")).toBeNull();
    } finally {
      settings[Symbol.dispose]();
    }
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      expect(() =>
        settings.hydrateFeature("chat", 0, {
          statusBar: {
            schema: StatusBarSchema,
            default: StatusBarDefault,
          },
        }),
      ).toThrow("Unknown setting for feature chat: stale");
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("does not commit manifest changes when hydration fails", async () => {
    const manifest = {
      name: "Demo",
      features: [{ entry: "./feature.ts" }],
    };
    const manifestPath = await tempManifest(manifest);
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      expect(() =>
        settings.hydrateFeature("chat", 0, {
          enabled: { schema: Type.Boolean(), default: true },
          broken: { schema: Type.Boolean(), default: "yes" },
        }),
      ).toThrow();

      await settings.flush();
      expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(
        manifest,
      );
    } finally {
      settings[Symbol.dispose]();
    }
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });
    const changes: unknown[] = [];

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      const chat = settings.forFeature("chat");
      chat.onChange("statusBar", (value) => changes.push(value));

      chat.set("statusBar", { order: ["model"], hidden: ["context"] });

      expect(chat.get("statusBar")).toEqual({
        order: ["model"],
        hidden: ["context"],
      });
      expect(changes).toEqual([{ order: ["model"], hidden: ["context"] }]);
      expect(() => chat.set("statusBar", { order: [1], hidden: [] })).toThrow();

      await settings.flush();
      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        unknown: unknown;
        features: Array<{ settings: Record<string, unknown> }>;
      };

      expect(written.unknown).toEqual({ preserved: true });
      expect(written.features).toEqual([
        {
          entry: "./feature.ts",
          settings: { statusBar: { order: ["model"], hidden: ["context"] } },
        },
        { entry: "./canvas.ts", settings: { zoom: 2 } },
      ]);
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("keeps dirty settings after a failed flush", async () => {
    const initialManifest = {
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    };
    const manifestPath = await tempManifest(initialManifest);
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      settings.forFeature("chat").set("statusBar", {
        order: ["model"],
        hidden: [],
      });

      const root = path.dirname(manifestPath);
      await rm(root, { recursive: true, force: true });
      await expect(settings.flush()).rejects.toThrow();

      await mkdir(root, { recursive: true });
      await writeFile(
        manifestPath,
        `${JSON.stringify(initialManifest, null, 2)}\n`,
        "utf8",
      );
      await settings.flush();

      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        features: Array<{ settings: Record<string, unknown> }>;
      };
      expect(written.features[0]?.settings).toEqual({
        statusBar: { order: ["model"], hidden: [] },
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("schedules persistence before notifying change listeners", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    });
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      settings.forFeature("chat").onChange("statusBar", () => {
        throw new Error("listener failed");
      });

      expect(() =>
        settings.forFeature("chat").set("statusBar", {
          order: ["model"],
          hidden: [],
        }),
      ).toThrow("listener failed");

      await settings.flush();
      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        features: Array<{ settings: Record<string, unknown> }>;
      };
      expect(written.features[0]?.settings).toEqual({
        statusBar: { order: ["model"], hidden: [] },
      });
    } finally {
      settings[Symbol.dispose]();
    }
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      await writeFile(manifestPath, "{ not json", "utf8");

      await expect(settings.reload()).rejects.toThrow("Expected property name");
      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["model"],
        hidden: [],
        nested: { density: "normal" },
      });
    } finally {
      settings[Symbol.dispose]();
    }
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
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      settings.forFeature("chat").set("statusBar", {
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
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["thinking"],
        hidden: [],
        nested: { density: "normal" },
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("binds settings change listeners to a DisposableBag", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ entry: "./feature.ts", settings: {} }],
    });
    const settings = new WorkspaceSettingsStore(manifestPath, {
      flushDebounceMs: 1000,
    });
    const bag = new DisposableBag();
    const changes: unknown[] = [];

    try {
      await settings.reload();
      settings.hydrateFeature("chat", 0, {
        statusBar: {
          schema: StatusBarSchema,
          default: StatusBarDefault,
        },
      });
      const chat = bindFeatureSettingsStore(settings.forFeature("chat"), bag);
      chat.onChange("statusBar", (value) => changes.push(value));
      bag.clear();

      chat.set("statusBar", { order: ["model"], hidden: [] });

      expect(changes).toEqual([]);
    } finally {
      settings[Symbol.dispose]();
    }
  });
});
