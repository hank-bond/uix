import { KeybindingMapSchema } from "@uix/api/actions";
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

function registerCommitted(
  registry: SettingsRegistry,
  scopeId: string,
  settingsScope: SettingsScope,
): Disposable {
  const registration = registry.registerScope(scopeId, settingsScope);
  registration.commit();
  return registration;
}

describe("hydrateSettings", () => {
  it("hydrates missing object fields from explicit defaults", () => {
    const values = hydrateSettings(
      StatusSettings,
      { statusBar: { hidden: ["context"] } },
      "feature chat",
    );

    expect(values).toEqual({
      statusBar: {
        order: ["model", "context"],
        hidden: ["context"],
        nested: { density: "normal" },
      },
    });
  });

  it("preserves persisted values that already match", () => {
    const persisted = { statusBar: structuredClone(StatusBarDefault) };
    const values = hydrateSettings(StatusSettings, persisted, "feature chat");

    expect(values).toEqual(persisted);
  });

  it("hydrates scalar defaults and treats null as an explicit value", () => {
    const values = hydrateSettings(
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
    const values = hydrateSettings(
      defineSettings({
        schema: Type.Object({
          defaultModel: Type.Optional(Type.Object({ id: Type.String() })),
        }),
      }),
      undefined,
      "workspace namespace agent",
    );

    expect(values).toEqual({});
  });

  it("validates persisted values for optional settings", () => {
    const definition = defineSettings({
      schema: Type.Object({
        defaultModel: Type.Optional(Type.Object({ id: Type.String() })),
      }),
    });

    const values = hydrateSettings(
      definition,
      { defaultModel: { id: "claude" } },
      "workspace namespace agent",
    );
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
      ),
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
    registerCommitted(registry, "chat", scope());

    expect(() => registry.registerScope("chat", scope())).toThrow(
      "Settings scope already registered: chat",
    );
  });

  it("disposes only the exact scope registration it created", () => {
    using registry = new SettingsRegistry();
    const stale = registry.registerScope("chat", scope());

    registry.clearScopes();
    registerCommitted(registry, "chat", scope());
    stale[Symbol.dispose]();

    expect(registry.get("chat", "statusBar")).toEqual(StatusBarDefault);
  });

  it("buffers provisional writes until commit", () => {
    using registry = new SettingsRegistry();
    const written: unknown[] = [];
    const scopedChanges: unknown[] = [];
    const globalChanges: unknown[] = [];
    const registration = registry.registerScope(
      "chat",
      scope({ onWrite: (values) => written.push(structuredClone(values)) }),
    );
    registry.onChange("chat", "statusBar", (value) =>
      scopedChanges.push(value),
    );
    registry.onAnyChange((_scopeId, _key, value) => globalChanges.push(value));

    registry.set("chat", "statusBar", { order: ["context"], hidden: [] });

    expect(registry.get("chat", "statusBar")).toEqual({
      order: ["context"],
      hidden: [],
    });
    expect(scopedChanges).toEqual([{ order: ["context"], hidden: [] }]);
    expect(globalChanges).toEqual([]);
    expect(written).toEqual([]);

    registration.commit();
    expect(written).toEqual([
      { statusBar: { order: ["context"], hidden: [] } },
    ]);

    registry.set("chat", "statusBar", { order: ["model"], hidden: [] });
    expect(written).toEqual([
      { statusBar: { order: ["context"], hidden: [] } },
      { statusBar: { order: ["model"], hidden: [] } },
    ]);
    expect(globalChanges).toEqual([{ order: ["model"], hidden: [] }]);
  });

  it("serves validated get/set and notifies listeners", () => {
    using registry = new SettingsRegistry();
    const written: unknown[] = [];
    const changes: unknown[] = [];
    registerCommitted(
      registry,
      "chat",
      scope({ onWrite: (values) => written.push(structuredClone(values)) }),
    );
    written.length = 0;
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
    registerCommitted(registry, "agent", {
      label: "workspace namespace agent",
      definition: defineSettings({
        schema: Type.Object({ favorite: Type.Optional(Type.String()) }),
      }),
      values: {},
      onWrite: (values) => written.push(structuredClone(values)),
    });
    written.length = 0;
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
    registerCommitted(
      registry,
      "chat",
      scope({ onWrite: () => order.push("write") }),
    );
    order.length = 0;
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
    registerCommitted(registry, "chat", scope());

    registry.set("chat", "statusBar", { order: [], hidden: [] });

    expect(registry.get("chat", "statusBar")).toEqual({
      order: [],
      hidden: [],
    });
  });

  it("replaces one complete scope with one write before keyed notifications", () => {
    using registry = new SettingsRegistry();
    const writes: unknown[] = [];
    const changes: [string, unknown][] = [];
    registerCommitted(registry, "keybindings", {
      label: "workspace namespace keybindings",
      definition: defineSettings({ schema: KeybindingMapSchema }),
      values: {
        "chat.models": "mod+m",
        "chat.removed": "ctrl+r",
      },
      onWrite: (values) => writes.push(structuredClone(values)),
    });
    writes.length = 0;
    registry.onAnyChange((_scopeId, key, value) => {
      changes.push([key, value]);
    });

    const confirmed = registry.replaceScope("keybindings", {
      "chat.models": "ctrl+shift+m",
      "chat.added": null,
    });

    expect(confirmed).toEqual({
      "chat.models": "ctrl+shift+m",
      "chat.added": null,
    });
    expect(writes).toEqual([confirmed]);
    expect(changes).toEqual([
      ["chat.models", "ctrl+shift+m"],
      ["chat.removed", undefined],
      ["chat.added", null],
    ]);
  });

  it("returns detached scope snapshots and rejects replacements before mutation", () => {
    using registry = new SettingsRegistry();
    const writes: unknown[] = [];
    registerCommitted(registry, "keybindings", {
      label: "workspace namespace keybindings",
      definition: defineSettings({ schema: KeybindingMapSchema }),
      values: { "chat.models": "mod+m" },
      onWrite: (values) => writes.push(structuredClone(values)),
    });
    writes.length = 0;

    const snapshot = registry.getScopeSnapshot("keybindings");
    snapshot["chat.models"] = "ctrl+m";
    expect(registry.get("keybindings", "chat.models")).toBe("mod+m");

    expect(() =>
      registry.replaceScope("keybindings", {
        "chat.models": "mod+mod+m",
      }),
    ).toThrow();
    expect(registry.getScopeSnapshot("keybindings")).toEqual({
      "chat.models": "mod+m",
    });
    expect(writes).toEqual([]);
  });

  it("routes dynamically validated record keys through normal get and set", () => {
    using registry = new SettingsRegistry();
    registerCommitted(registry, "keybindings", {
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
    registerCommitted(registry, "chat", scope());

    expect(() => registry.get("canvas", "zoom")).toThrow(
      "Unknown settings scope: canvas",
    );
    expect(() => registry.get("chat", "zoom")).toThrow(
      "Unknown setting for feature chat: zoom",
    );
  });

  it("clearScopes drops scopes so ids can re-register", () => {
    using registry = new SettingsRegistry();
    registerCommitted(registry, "chat", scope());

    registry.clearScopes();

    expect(() => registry.get("chat", "statusBar")).toThrow(
      "Unknown settings scope: chat",
    );
    registerCommitted(registry, "chat", scope());
    expect(registry.get("chat", "statusBar")).toEqual(StatusBarDefault);
  });

  it("notifies onAnyChange with the scope id", () => {
    using registry = new SettingsRegistry();
    const seen: [string, string, unknown][] = [];
    registerCommitted(registry, "agent", {
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
    registerCommitted(registry, "chat", scope());
    const chat = bindSettingsHandle(registry.forScope("chat"), bag);
    chat.onChange("statusBar", (value) => changes.push(value));
    bag.clear();

    chat.set("statusBar", { order: ["model"], hidden: [] });

    expect(changes).toEqual([]);
  });
});
