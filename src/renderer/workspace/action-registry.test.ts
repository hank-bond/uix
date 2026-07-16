import { describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "./action-registry";

function createActionRegistry(): ActionRegistry {
  return new ActionRegistry({ shortcutPlatform: "other" });
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ActionRegistry", () => {
  it("registers, updates, and removes a feature-scoped contribution", () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const listener = vi.fn();
    const unsubscribe = registry.subscribeToCatalog(listener);
    const registration = registerChatActions({
      models: {
        title: "Models",
        children: {
          favorites: { title: "Favorite Models", run: () => undefined },
        },
      },
    });

    expect(registry.getCatalogSnapshot()).toMatchObject([
      {
        id: "chat.models.favorites",
        path: ["Models", "Favorite Models"],
      },
    ]);
    const registeredSnapshot = registry.getCatalogSnapshot();
    expect(registry.getCatalogSnapshot()).toBe(registeredSnapshot);

    registration.update({
      models: {
        title: "Model Settings",
        children: {
          favorites: { title: "Favorites", run: () => undefined },
          all: { title: "All Models", run: () => undefined },
        },
      },
    });

    expect(registry.getCatalogSnapshot().map(({ id }) => id)).toEqual([
      "chat.models.favorites",
      "chat.models.all",
    ]);
    expect(registry.getCatalogSnapshot()[0]?.path).toEqual([
      "Model Settings",
      "Favorites",
    ]);

    registration[Symbol.dispose]();
    registration[Symbol.dispose]();
    expect(registry.getCatalogSnapshot()).toEqual([]);
    expect(() => registration.update({})).toThrow(
      "Action contribution registration is disposed",
    );
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("publishes a stable default-binding snapshot only when the template changes", async () => {
    const registry = createActionRegistry();
    const defaultBindingListener = vi.fn();
    registry.subscribeToDefaultBindings(defaultBindingListener);
    const registration = registry.forFeature("chat")({
      models: {
        title: "Models",
        defaultBinding: "shift+mod+m",
        run: () => undefined,
      },
    });

    expect(registry.getDefaultBindingsSnapshot()).toEqual({
      "chat.models": "mod+shift+m",
    });
    const initialDefaults = registry.getDefaultBindingsSnapshot();
    expect(defaultBindingListener).toHaveBeenCalledOnce();

    await registry.invoke("chat.models");
    registration.update({
      models: {
        title: "Choose Model",
        defaultBinding: "mod+shift+m",
        run: () => undefined,
      },
    });

    expect(registry.getDefaultBindingsSnapshot()).toBe(initialDefaults);
    expect(defaultBindingListener).toHaveBeenCalledOnce();

    registration.update({
      models: {
        title: "Choose Model",
        defaultBinding: "ctrl+m",
        run: () => undefined,
      },
    });
    expect(registry.getDefaultBindingsSnapshot()).toEqual({
      "chat.models": "ctrl+m",
    });
    expect(defaultBindingListener).toHaveBeenCalledTimes(2);

    registration[Symbol.dispose]();
    expect(registry.getDefaultBindingsSnapshot()).toEqual({});
    expect(defaultBindingListener).toHaveBeenCalledTimes(3);
  });

  it("distinguishes unhydrated bindings from a stable confirmed snapshot", () => {
    const registry = createActionRegistry();

    expect(registry.getConfirmedBindingsSnapshot()).toBeUndefined();
    registry.setConfirmedBindings({});
    expect(registry.getConfirmedBindingsSnapshot()).toEqual({});

    registry.setConfirmedBindings({
      "chat.models": "mod+m",
      "chat.all": null,
    });
    const confirmed = registry.getConfirmedBindingsSnapshot();
    const unresolved = registry.getUnresolvedBindingsSnapshot();
    expect(unresolved).toEqual({
      "chat.models": "mod+m",
      "chat.all": null,
    });
    registry.setConfirmedBindings({
      "chat.all": null,
      "chat.models": "mod+m",
    });

    expect(registry.getConfirmedBindingsSnapshot()).toBe(confirmed);
    expect(registry.getUnresolvedBindingsSnapshot()).toBe(unresolved);
  });

  it("projects confirmed bindings across catalog and unresolved entries", () => {
    const registry = createActionRegistry();
    const chatRegistration = registry.forFeature("chat")({
      models: { title: "Models", run: () => undefined },
    });
    const canvasRegistration = registry.forFeature("canvas")({
      refresh: { title: "Refresh", run: () => undefined },
    });

    expect(registry.getCatalogSnapshot()[0]).not.toHaveProperty("binding");
    expect(registry.getUnresolvedBindingsSnapshot()).toBeUndefined();

    registry.setConfirmedBindings({
      "chat.models": "mod+k",
      "canvas.refresh": "ctrl+k",
      "removed.open": "ctrl+o",
    });

    expect(
      registry.getCatalogSnapshot().map(({ id, binding, conflictsWith }) => ({
        id,
        binding,
        conflictsWith,
      })),
    ).toEqual([
      {
        id: "chat.models",
        binding: "ctrl+k",
        conflictsWith: ["canvas.refresh"],
      },
      {
        id: "canvas.refresh",
        binding: "ctrl+k",
        conflictsWith: ["chat.models"],
      },
    ]);
    expect(registry.getUnresolvedBindingsSnapshot()).toEqual({
      "removed.open": "ctrl+o",
    });
    const unresolved = registry.getUnresolvedBindingsSnapshot();
    chatRegistration.update({
      models: { title: "Choose Model", run: () => undefined },
    });
    expect(registry.getUnresolvedBindingsSnapshot()).toBe(unresolved);

    canvasRegistration[Symbol.dispose]();
    expect(registry.getUnresolvedBindingsSnapshot()).toEqual({
      "canvas.refresh": "ctrl+k",
      "removed.open": "ctrl+o",
    });
  });

  it("rejects canonical collisions without changing existing registrations", () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const first = registerChatActions({
      models: { title: "Models", run: () => undefined },
    });

    expect(() =>
      registerChatActions({
        models: { title: "Other Models", run: () => undefined },
      }),
    ).toThrow("Action already registered: chat.models (owner chat)");
    expect(registry.getCatalogSnapshot()).toHaveLength(1);

    const second = registerChatActions({
      providers: { title: "Providers", run: () => undefined },
    });
    expect(() =>
      second.update({
        models: { title: "Models Again", run: () => undefined },
      }),
    ).toThrow("Action already registered: chat.models (owner chat)");
    expect(registry.getCatalogSnapshot().map(({ id }) => id)).toEqual([
      "chat.models",
      "chat.providers",
    ]);

    first[Symbol.dispose]();
    second[Symbol.dispose]();
  });

  it("invokes enabled actions and reports non-invocation reasons", async () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const run = vi.fn();
    registerChatActions({
      open: { title: "Open", run },
      disabled: { title: "Disabled", enabled: false, run },
    });

    await expect(registry.invoke("chat.open")).resolves.toEqual({
      status: "completed",
    });
    await expect(registry.invoke("chat.disabled")).resolves.toEqual({
      status: "not_invoked",
      reason: "disabled",
    });
    await expect(registry.invoke("chat.missing")).resolves.toEqual({
      status: "not_invoked",
      reason: "not_found",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("allows one in-flight invocation per action while other actions run", async () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const pending = deferred();
    const other = vi.fn();
    registerChatActions({
      refresh: { title: "Refresh", run: () => pending.promise },
      open: { title: "Open", run: other },
    });

    const invocation = registry.invoke("chat.refresh");
    expect(
      registry.getCatalogSnapshot().find(({ id }) => id === "chat.refresh"),
    ).toMatchObject({ running: true });
    await expect(registry.invoke("chat.refresh")).resolves.toEqual({
      status: "not_invoked",
      reason: "already_running",
    });
    await expect(registry.invoke("chat.open")).resolves.toEqual({
      status: "completed",
    });

    pending.resolve();
    await expect(invocation).resolves.toEqual({ status: "completed" });
    expect(
      registry.getCatalogSnapshot().find(({ id }) => id === "chat.refresh"),
    ).toMatchObject({ running: false });
    expect(other).toHaveBeenCalledOnce();
  });

  it("preserves running state across contribution updates", async () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const pending = deferred();
    const replacement = vi.fn();
    const registration = registerChatActions({
      refresh: { title: "Refresh", run: () => pending.promise },
    });

    const invocation = registry.invoke("chat.refresh");
    registration.update({
      refresh: { title: "Refresh Models", run: replacement },
    });
    expect(registry.getCatalogSnapshot()[0]).toMatchObject({
      title: "Refresh Models",
      running: true,
    });
    await expect(registry.invoke("chat.refresh")).resolves.toEqual({
      status: "not_invoked",
      reason: "already_running",
    });

    pending.resolve();
    await invocation;
    await registry.invoke("chat.refresh");
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("propagates callback errors and does not resurrect disposed actions", async () => {
    const registry = createActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const pending = deferred();
    const registration = registerChatActions({
      refresh: { title: "Refresh", run: () => pending.promise },
      fail: {
        title: "Fail",
        run: () => {
          throw new Error("deliberate failure");
        },
      },
    });

    await expect(registry.invoke("chat.fail")).rejects.toThrow(
      "deliberate failure",
    );
    expect(
      registry.getCatalogSnapshot().find(({ id }) => id === "chat.fail")
        ?.running,
    ).toBe(false);

    const invocation = registry.invoke("chat.refresh");
    registration[Symbol.dispose]();
    expect(registry.getCatalogSnapshot()).toEqual([]);
    pending.resolve();
    await invocation;
    expect(registry.getCatalogSnapshot()).toEqual([]);
  });
});
