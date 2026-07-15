import { defineSettings } from "@uix/api/settings";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import { DisposableBag } from "./lifecycle";
import {
  bindSettingsHandle,
  hydrateSettings,
  SettingsRegistry,
  type SettingsScope,
} from "./settings-registry";

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
const StatusSettings = defineSettings({
  schema: Type.Object({ statusBar: StatusBarSchema }),
  default: { statusBar: StatusBarDefault },
});

function scope(overrides: Partial<SettingsScope> = {}): SettingsScope {
  return {
    label: "feature chat",
    definition: StatusSettings,
    values: { statusBar: structuredClone(StatusBarDefault) },
    ...overrides,
  };
}

describe("hydrateSettings", () => {
  it("hydrates missing object fields from explicit defaults", () => {
    const { values, changed } = hydrateSettings(
      StatusSettings,
      { statusBar: { hidden: ["context"] } },
      "feature chat",
    );

    expect(changed).toBe(true);
    expect(values).toEqual({
      statusBar: {
        order: ["model", "context"],
        hidden: ["context"],
        nested: { density: "normal" },
      },
    });
  });

  it("does not report change when persisted values already match", () => {
    const persisted = { statusBar: structuredClone(StatusBarDefault) };
    const { values, changed } = hydrateSettings(
      StatusSettings,
      persisted,
      "feature chat",
    );

    expect(changed).toBe(false);
    expect(values).toEqual(persisted);
  });

  it("hydrates scalar defaults and treats null as an explicit value", () => {
    const { values } = hydrateSettings(
      defineSettings({
        schema: Type.Object({
          enabled: Type.Boolean(),
          selected: Type.Union([Type.String(), Type.Null()]),
        }),
        default: { enabled: true, selected: "main" },
      }),
      { selected: null },
      "feature chat",
    );

    expect(values["enabled"]).toBe(true);
    expect(values["selected"]).toBeNull();
  });

  it("materializes an empty registered scope while leaving optional values absent", () => {
    const { values, changed } = hydrateSettings(
      defineSettings({
        schema: Type.Object({
          defaultModel: Type.Optional(Type.Object({ id: Type.String() })),
        }),
      }),
      undefined,
      "workspace namespace agent",
    );

    expect(changed).toBe(true);
    expect(values).toEqual({});
  });

  it("validates persisted values for optional settings", () => {
    const definition = defineSettings({
      schema: Type.Object({
        defaultModel: Type.Optional(Type.Object({ id: Type.String() })),
      }),
    });

    const { values, changed } = hydrateSettings(
      definition,
      { defaultModel: { id: "claude" } },
      "workspace namespace agent",
    );
    expect(changed).toBe(false);
    expect(values).toEqual({ defaultModel: { id: "claude" } });

    expect(() =>
      hydrateSettings(
        definition,
        { defaultModel: 5 },
        "workspace namespace agent",
      ),
    ).toThrow();
  });

  it("rejects unknown persisted setting keys with the scope label", () => {
    expect(() =>
      hydrateSettings(StatusSettings, { stale: true }, "feature chat"),
    ).toThrow("Invalid settings for feature chat");
  });

  it("validates dynamic record keys and values through the same scope path", () => {
    const keybindings = defineSettings({
      schema: Type.Record(
        Type.String({ pattern: "^[a-z]+(?:\\.[a-z]+)+$" }),
        Type.Union([Type.String(), Type.Null()]),
      ),
    });

    expect(
      hydrateSettings(
        keybindings,
        { "chat.models": "mod+m", "chat.disabled": null },
        "workspace namespace keybindings",
      ).values,
    ).toEqual({ "chat.models": "mod+m", "chat.disabled": null });
    expect(() =>
      hydrateSettings(
        keybindings,
        { "Chat models": "mod+m" },
        "workspace namespace keybindings",
      ),
    ).toThrow("Invalid settings for workspace namespace keybindings");
  });
});

describe("SettingsRegistry", () => {
  it("rejects duplicate scope ids", () => {
    using registry = new SettingsRegistry();
    registry.registerScope("chat", scope());

    expect(() => registry.registerScope("chat", scope())).toThrow(
      "Settings scope already registered: chat",
    );
  });

  it("serves validated get/set and notifies listeners", () => {
    using registry = new SettingsRegistry();
    const written: unknown[] = [];
    const changes: unknown[] = [];
    registry.registerScope(
      "chat",
      scope({ onWrite: (values) => written.push(structuredClone(values)) }),
    );
    const chat = registry.forScope("chat");
    chat.onChange("statusBar", (value) => changes.push(value));

    chat.set("statusBar", { order: ["model"], hidden: ["context"] });

    expect(chat.get("statusBar")).toEqual({
      order: ["model"],
      hidden: ["context"],
    });
    expect(changes).toEqual([{ order: ["model"], hidden: ["context"] }]);
    expect(written).toEqual([
      { statusBar: { order: ["model"], hidden: ["context"] } },
    ]);
    expect(() => chat.set("statusBar", { order: [1], hidden: [] })).toThrow();
  });

  it("rejects undefined instead of treating it as a persisted deletion", () => {
    using registry = new SettingsRegistry();
    const written: unknown[] = [];
    const changes: unknown[] = [];
    registry.registerScope("agent", {
      label: "workspace namespace agent",
      definition: defineSettings({
        schema: Type.Object({ favorite: Type.Optional(Type.String()) }),
      }),
      values: {},
      onWrite: (values) => written.push(structuredClone(values)),
    });
    registry.onChange("agent", "favorite", (value) => changes.push(value));

    expect(() => registry.set("agent", "favorite", undefined)).toThrow(
      "favorite cannot be undefined",
    );
    expect(registry.get("agent", "favorite")).toBeUndefined();
    expect(written).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("invokes the write hook before notifying listeners", () => {
    using registry = new SettingsRegistry();
    const order: string[] = [];
    registry.registerScope(
      "chat",
      scope({ onWrite: () => order.push("write") }),
    );
    registry.onChange("chat", "statusBar", () => {
      order.push("notify");
      throw new Error("listener failed");
    });

    expect(() =>
      registry.set("chat", "statusBar", { order: [], hidden: [] }),
    ).toThrow("listener failed");
    expect(order).toEqual(["write", "notify"]);
  });

  it("supports ephemeral scopes without a write hook", () => {
    using registry = new SettingsRegistry();
    registry.registerScope("chat", scope());

    registry.set("chat", "statusBar", { order: [], hidden: [] });

    expect(registry.get("chat", "statusBar")).toEqual({
      order: [],
      hidden: [],
    });
  });

  it("routes dynamically validated record keys through normal get and set", () => {
    using registry = new SettingsRegistry();
    registry.registerScope("keybindings", {
      label: "workspace namespace keybindings",
      definition: defineSettings({
        schema: Type.Record(
          Type.String({ pattern: "^[a-z]+(?:\\.[a-z]+)+$" }),
          Type.Union([
            Type.String({ pattern: "^(?:mod|ctrl)\\+[a-z]$" }),
            Type.Null(),
          ]),
        ),
      }),
      values: {},
    });

    registry.set("keybindings", "chat.models", "mod+m");
    registry.set("keybindings", "chat.disabled", null);

    expect(registry.get("keybindings", "chat.models")).toBe("mod+m");
    expect(registry.get("keybindings", "chat.disabled")).toBeNull();
    expect(() => registry.set("keybindings", "Chat models", "mod+m")).toThrow(
      "Unknown setting",
    );
    expect(() => registry.set("keybindings", "chat.bad", "shift m")).toThrow();
  });

  it("throws for unknown scopes and unknown keys", () => {
    using registry = new SettingsRegistry();
    registry.registerScope("chat", scope());

    expect(() => registry.get("canvas", "zoom")).toThrow(
      "Unknown settings scope: canvas",
    );
    expect(() => registry.get("chat", "zoom")).toThrow(
      "Unknown setting for feature chat: zoom",
    );
  });

  it("clearScopes drops scopes so ids can re-register", () => {
    using registry = new SettingsRegistry();
    registry.registerScope("chat", scope());

    registry.clearScopes();

    expect(() => registry.get("chat", "statusBar")).toThrow(
      "Unknown settings scope: chat",
    );
    registry.registerScope("chat", scope());
    expect(registry.get("chat", "statusBar")).toEqual(StatusBarDefault);
  });

  it("notifies onAnyChange with the scope id", () => {
    using registry = new SettingsRegistry();
    const seen: [string, string, unknown][] = [];
    registry.registerScope("agent", {
      label: "workspace namespace agent",
      definition: defineSettings({
        schema: Type.Object({
          defaultModel: Type.Optional(
            Type.Object({ provider: Type.String(), id: Type.String() }),
          ),
        }),
      }),
      values: {},
    });
    registry.onAnyChange((scopeId, key, value) =>
      seen.push([scopeId, key, value]),
    );

    registry.set("agent", "defaultModel", { provider: "anthropic", id: "x" });

    expect(seen).toEqual([
      ["agent", "defaultModel", { provider: "anthropic", id: "x" }],
    ]);
  });

  it("binds settings change listeners to a DisposableBag", () => {
    using registry = new SettingsRegistry();
    const bag = new DisposableBag();
    const changes: unknown[] = [];
    registry.registerScope("chat", scope());
    const chat = bindSettingsHandle(registry.forScope("chat"), bag);
    chat.onChange("statusBar", (value) => changes.push(value));
    bag.clear();

    chat.set("statusBar", { order: ["model"], hidden: [] });

    expect(changes).toEqual([]);
  });
});
