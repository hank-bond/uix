import type { KeybindingMap } from "@uix/api/actions";
import type { ChannelClient } from "@uix/api/workspace";
import { describe, expect, it, vi } from "vitest";

import { uixChannels } from "#shared/ipc";

import { ActionRegistry } from "./action-registry";
import { bindKeybindingSync } from "./keybinding-sync";

type UixChannelClient = ChannelClient<typeof uixChannels>;

function createActionRegistry(): ActionRegistry {
  return new ActionRegistry({ shortcutPlatform: "other" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createClient(
  reconcile: (defaults: KeybindingMap) => Promise<KeybindingMap>,
) {
  let bindingsChanged: ((bindings: KeybindingMap) => void) | undefined;
  let surfacesChanged: (() => void) | undefined;
  const unsubscribeBindings = vi.fn();
  const unsubscribeSurfaces = vi.fn();
  const reconcileKeybindings = vi.fn(reconcile);
  const client = {
    requests: {
      reconcile_keybindings: reconcileKeybindings,
    },
    events: {
      keybindings_changed(handler: (bindings: KeybindingMap) => void) {
        bindingsChanged = handler;
        return unsubscribeBindings;
      },
      surfaces_changed(handler: () => void) {
        surfacesChanged = handler;
        return unsubscribeSurfaces;
      },
    },
  } as unknown as UixChannelClient;

  return {
    client,
    reconcileKeybindings,
    emitBindingsChanged: (bindings: KeybindingMap) =>
      bindingsChanged?.(bindings),
    emitSurfacesChanged: () => surfacesChanged?.(),
    unsubscribeBindings,
    unsubscribeSurfaces,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("bindKeybindingSync", () => {
  it("reconciles the current default template and accepts confirmation", async () => {
    const registry = createActionRegistry();
    registry.forFeature("chat")({
      models: {
        title: "Models",
        defaultBinding: "shift+mod+m",
        run: () => undefined,
      },
    });
    const fake = createClient((defaults) => Promise.resolve(defaults));
    using binding = bindKeybindingSync(registry, fake.client);

    await flushMicrotasks();

    expect(fake.reconcileKeybindings).toHaveBeenCalledWith({
      "chat.models": "mod+shift+m",
    });
    expect(registry.getConfirmedBindingsSnapshot()).toEqual({
      "chat.models": "mod+shift+m",
    });
    expect(binding).toBeDefined();
  });

  it("batches same-turn default-template changes into one reconciliation", async () => {
    const registry = createActionRegistry();
    const fake = createClient((defaults) => Promise.resolve(defaults));
    using binding = bindKeybindingSync(registry, fake.client);
    await flushMicrotasks();
    fake.reconcileKeybindings.mockClear();

    registry.forFeature("chat")({
      models: {
        title: "Models",
        defaultBinding: "mod+m",
        run: () => undefined,
      },
    });
    registry.forFeature("canvas")({
      refresh: {
        title: "Refresh",
        defaultBinding: "mod+r",
        run: () => undefined,
      },
    });
    await flushMicrotasks();

    expect(fake.reconcileKeybindings).toHaveBeenCalledOnce();
    expect(fake.reconcileKeybindings).toHaveBeenCalledWith({
      "chat.models": "mod+m",
      "canvas.refresh": "mod+r",
    });
    expect(binding).toBeDefined();
  });

  it("keeps a published confirmation over an older request response", async () => {
    const initial = deferred<KeybindingMap>();
    let requestCount = 0;
    const fake = createClient(() => {
      requestCount += 1;
      return requestCount === 1
        ? initial.promise
        : Promise.resolve({ "chat.models": "ctrl+m" });
    });
    const registry = createActionRegistry();
    using binding = bindKeybindingSync(registry, fake.client);
    await flushMicrotasks();

    fake.emitBindingsChanged({ "chat.models": "mod+m" });
    initial.resolve({ "chat.models": "alt+m" });
    await flushMicrotasks();

    expect(registry.getConfirmedBindingsSnapshot()).toEqual({
      "chat.models": "mod+m",
    });

    fake.emitSurfacesChanged();
    await flushMicrotasks();
    expect(registry.getConfirmedBindingsSnapshot()).toEqual({
      "chat.models": "ctrl+m",
    });
    expect(binding).toBeDefined();
  });

  it("unsubscribes and ignores pending responses when disposed", async () => {
    const pending = deferred<KeybindingMap>();
    const fake = createClient(() => pending.promise);
    const registry = createActionRegistry();
    const binding = bindKeybindingSync(registry, fake.client);
    await flushMicrotasks();

    binding[Symbol.dispose]();
    pending.resolve({ "chat.models": "mod+m" });
    await flushMicrotasks();

    expect(fake.unsubscribeBindings).toHaveBeenCalledOnce();
    expect(fake.unsubscribeSurfaces).toHaveBeenCalledOnce();
    expect(registry.getConfirmedBindingsSnapshot()).toBeUndefined();
  });
});
