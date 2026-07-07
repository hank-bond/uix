import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";

import { DisposableBag } from "./lifecycle";
import { bindFeatureSettings, WorkspaceSettings } from "./workspace-settings";

const roots: string[] = [];

const StatusBarSchema = Type.Object({
  order: Type.Array(Type.String(), { default: ["model", "context"] }),
  hidden: Type.Array(Type.String(), { default: [] }),
});

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

describe("WorkspaceSettings", () => {
  it("hydrates missing field defaults into feature-local manifest settings", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          id: "chat",
          entry: "./feature.ts",
          settings: { statusBar: { hidden: ["context"] } },
        },
      ],
    });
    const settings = new WorkspaceSettings(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: StatusBarSchema },
      ]);

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["model", "context"],
        hidden: ["context"],
      });

      await settings.flush();
      const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
        features: Array<{ id: string; settings: Record<string, unknown> }>;
      };
      expect(written.features[0]?.settings).toEqual({
        statusBar: { order: ["model", "context"], hidden: ["context"] },
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("does not overwrite persisted values when schema defaults change", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          id: "chat",
          entry: "./feature.ts",
          settings: { statusBar: { order: ["old"], hidden: [] } },
        },
      ],
    });
    const settings = new WorkspaceSettings(manifestPath, {
      flushDebounceMs: 1000,
    });
    const changedDefaultSchema = Type.Object({
      order: Type.Array(Type.String(), { default: ["new"] }),
      hidden: Type.Array(Type.String(), { default: [] }),
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: changedDefaultSchema },
      ]);

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["old"],
        hidden: [],
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("updates memory immediately, validates set values, and flushes feature-local settings", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        { id: "chat", entry: "./feature.ts", settings: {} },
        { id: "canvas", entry: "./canvas.ts", settings: { zoom: 2 } },
      ],
      unknown: { preserved: true },
    });
    const settings = new WorkspaceSettings(manifestPath, {
      flushDebounceMs: 1000,
    });
    const changes: unknown[] = [];

    try {
      await settings.reload();
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: StatusBarSchema },
      ]);
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
        features: Array<{ id: string; settings: Record<string, unknown> }>;
      };

      expect(written.unknown).toEqual({ preserved: true });
      expect(written.features).toEqual([
        {
          id: "chat",
          entry: "./feature.ts",
          settings: { statusBar: { order: ["model"], hidden: ["context"] } },
        },
        { id: "canvas", entry: "./canvas.ts", settings: { zoom: 2 } },
      ]);
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("reload discards pending memory and reads disk", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [
        {
          id: "chat",
          entry: "./feature.ts",
          settings: { statusBar: { order: ["model"], hidden: [] } },
        },
      ],
    });
    const settings = new WorkspaceSettings(manifestPath, {
      flushDebounceMs: 1000,
    });

    try {
      await settings.reload();
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: StatusBarSchema },
      ]);
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
                id: "chat",
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
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: StatusBarSchema },
      ]);

      expect(settings.forFeature("chat").get("statusBar")).toEqual({
        order: ["thinking"],
        hidden: [],
      });
    } finally {
      settings[Symbol.dispose]();
    }
  });

  it("binds settings subscriptions to a DisposableBag", async () => {
    const manifestPath = await tempManifest({
      name: "Demo",
      features: [{ id: "chat", entry: "./feature.ts", settings: {} }],
    });
    const settings = new WorkspaceSettings(manifestPath, {
      flushDebounceMs: 1000,
    });
    const bag = new DisposableBag();
    const changes: unknown[] = [];

    try {
      await settings.reload();
      settings.hydrateFeature("chat", [
        { key: "statusBar", schema: StatusBarSchema },
      ]);
      const chat = bindFeatureSettings(settings.forFeature("chat"), bag);
      chat.onChange("statusBar", (value) => changes.push(value));
      bag.clear();

      chat.set("statusBar", { order: ["model"], hidden: [] });

      expect(changes).toEqual([]);
    } finally {
      settings[Symbol.dispose]();
    }
  });
});
