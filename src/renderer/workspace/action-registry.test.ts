import { describe, expect, it, vi } from "vitest";

import { ActionRegistry } from "./action-registry";

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
    const registry = new ActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const registration = registerChatActions({
      models: {
        title: "Models",
        children: {
          favorites: { title: "Favorite Models", run: () => undefined },
        },
      },
    });

    expect(registry.getSnapshot()).toMatchObject([
      {
        id: "chat.models.favorites",
        path: ["Models", "Favorite Models"],
      },
    ]);
    const registeredSnapshot = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(registeredSnapshot);

    registration.update({
      models: {
        title: "Model Settings",
        children: {
          favorites: { title: "Favorites", run: () => undefined },
          all: { title: "All Models", run: () => undefined },
        },
      },
    });

    expect(registry.getSnapshot().map(({ id }) => id)).toEqual([
      "chat.models.favorites",
      "chat.models.all",
    ]);
    expect(registry.getSnapshot()[0]?.path).toEqual([
      "Model Settings",
      "Favorites",
    ]);

    registration[Symbol.dispose]();
    registration[Symbol.dispose]();
    expect(registry.getSnapshot()).toEqual([]);
    expect(() => registration.update({})).toThrow(
      "Action contribution registration is disposed",
    );
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("rejects canonical collisions without changing existing registrations", () => {
    const registry = new ActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const first = registerChatActions({
      models: { title: "Models", run: () => undefined },
    });

    expect(() =>
      registerChatActions({
        models: { title: "Other Models", run: () => undefined },
      }),
    ).toThrow("Action already registered: chat.models (owner chat)");
    expect(registry.getSnapshot()).toHaveLength(1);

    const second = registerChatActions({
      providers: { title: "Providers", run: () => undefined },
    });
    expect(() =>
      second.update({
        models: { title: "Models Again", run: () => undefined },
      }),
    ).toThrow("Action already registered: chat.models (owner chat)");
    expect(registry.getSnapshot().map(({ id }) => id)).toEqual([
      "chat.models",
      "chat.providers",
    ]);

    first[Symbol.dispose]();
    second[Symbol.dispose]();
  });

  it("invokes enabled actions and reports non-invocation reasons", async () => {
    const registry = new ActionRegistry();
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
    const registry = new ActionRegistry();
    const registerChatActions = registry.forFeature("chat");
    const pending = deferred();
    const other = vi.fn();
    registerChatActions({
      refresh: { title: "Refresh", run: () => pending.promise },
      open: { title: "Open", run: other },
    });

    const invocation = registry.invoke("chat.refresh");
    expect(
      registry.getSnapshot().find(({ id }) => id === "chat.refresh"),
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
      registry.getSnapshot().find(({ id }) => id === "chat.refresh"),
    ).toMatchObject({ running: false });
    expect(other).toHaveBeenCalledOnce();
  });

  it("preserves running state across contribution updates", async () => {
    const registry = new ActionRegistry();
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
    expect(registry.getSnapshot()[0]).toMatchObject({
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
    const registry = new ActionRegistry();
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
      registry.getSnapshot().find(({ id }) => id === "chat.fail")?.running,
    ).toBe(false);

    const invocation = registry.invoke("chat.refresh");
    registration[Symbol.dispose]();
    expect(registry.getSnapshot()).toEqual([]);
    pending.resolve();
    await invocation;
    expect(registry.getSnapshot()).toEqual([]);
  });
});
