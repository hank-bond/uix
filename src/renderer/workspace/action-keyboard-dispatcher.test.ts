import { describe, expect, it, vi } from "vitest";

import type { ActionContribution, KeybindingMap } from "@uix/api/actions";

import { bindActionKeyboardDispatcher } from "./action-keyboard-dispatcher";
import { ActionRegistry } from "./action-registry";

class KeyboardTarget {
  listener: ((event: KeyboardEvent) => void) | undefined;

  addEventListener(
    _type: "keydown",
    listener: (event: KeyboardEvent) => void,
  ): void {
    this.listener = listener;
  }

  removeEventListener(
    _type: "keydown",
    listener: (event: KeyboardEvent) => void,
  ): void {
    if (this.listener === listener) this.listener = undefined;
  }

  dispatch(event: KeyboardEvent): void {
    this.listener?.(event);
  }
}

interface KeyboardEventOptions {
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  altGraph?: boolean;
  path?: readonly unknown[];
}

function keyboardEvent(options: KeyboardEventOptions = {}): {
  event: KeyboardEvent;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  return {
    event: {
      altKey: false,
      code: "KeyK",
      ctrlKey: false,
      defaultPrevented: false,
      isComposing: false,
      key: "k",
      metaKey: false,
      repeat: false,
      shiftKey: false,
      composedPath: () => [...(options.path ?? [])],
      getModifierState: (modifier: string) =>
        modifier === "AltGraph" && options.altGraph === true,
      preventDefault,
      ...options,
    } as unknown as KeyboardEvent,
    preventDefault,
  };
}

function createRegistry(
  actions: ActionContribution,
  bindings?: KeybindingMap,
): ActionRegistry {
  const registry = new ActionRegistry({ shortcutPlatform: "macos" });
  registry.forFeature("test")(actions);
  if (bindings) registry.setConfirmedBindings(bindings);
  return registry;
}

const editableTarget = { tagName: "input", isContentEditable: false };

describe("bindActionKeyboardDispatcher", () => {
  it("dispatches a unique hydrated binding through the registry", () => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({ ctrlKey: true });

    target.dispatch(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not claim gestures before bindings are hydrated", () => {
    const run = vi.fn();
    using registry = createRegistry({ open: { title: "Open", run } });
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({ ctrlKey: true });

    target.dispatch(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves explicitly unbound actions untouched", () => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": null },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({ ctrlKey: true });

    target.dispatch(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("claims conflicts without invoking either action", () => {
    const first = vi.fn();
    const second = vi.fn();
    using registry = createRegistry(
      {
        first: { title: "First", run: first },
        second: { title: "Second", run: second },
      },
      {
        "test.first": "mod+k",
        "test.second": "mod+k",
      },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({ metaKey: true });

    target.dispatch(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "Control",
      binding: "ctrl+c",
      event: { key: "c", code: "KeyC", ctrlKey: true },
      invoked: true,
    },
    {
      name: "Command",
      binding: "mod+m",
      event: { key: "m", code: "KeyM", metaKey: true },
      invoked: true,
    },
    {
      name: "Alt/Option",
      binding: "alt+a",
      event: { key: "a", code: "KeyA", altKey: true },
      invoked: true,
    },
    {
      name: "Shift alone",
      binding: "shift+s",
      event: { key: "S", code: "KeyS", shiftKey: true },
      invoked: false,
    },
  ] as const)(
    "$name editable-target gesture invoked=$invoked",
    ({ binding: shortcut, event: eventOptions, invoked }) => {
      const run = vi.fn();
      using registry = createRegistry(
        { edit: { title: "Edit", run } },
        { "test.edit": shortcut },
      );
      const target = new KeyboardTarget();
      using _binding = bindActionKeyboardDispatcher(registry, target);
      const { event, preventDefault } = keyboardEvent({
        ...eventOptions,
        path: [editableTarget],
      });

      target.dispatch(event);

      expect(run).toHaveBeenCalledTimes(invoked ? 1 : 0);
      expect(preventDefault).toHaveBeenCalledTimes(invoked ? 1 : 0);
    },
  );

  it.each([
    { name: "composition", options: { isComposing: true } },
    { name: "AltGraph text entry", options: { ctrlKey: true, altGraph: true } },
    {
      name: "locally handled modal event",
      options: { defaultPrevented: true },
    },
  ])("leaves $name untouched", ({ options }) => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent(options);

    target.dispatch(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("suppresses claimed repeats without invoking", () => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({
      ctrlKey: true,
      repeat: true,
    });

    target.dispatch(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("claims disabled actions without running their callbacks", () => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", enabled: false, run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const { event, preventDefault } = keyboardEvent({ ctrlKey: true });

    target.dispatch(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("claims an already-running action without invoking it twice", async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const run = vi.fn(() => pending);
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);
    const first = keyboardEvent({ ctrlKey: true });
    const second = keyboardEvent({ ctrlKey: true });

    target.dispatch(first.event);
    target.dispatch(second.event);

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    complete();
    await pending;
  });

  it("publishes callback failures as keyboard invocation diagnostics", async () => {
    const error = new Error("failed");
    using registry = createRegistry(
      { open: { title: "Open", run: () => Promise.reject(error) } },
      { "test.open": "ctrl+k" },
    );
    const diagnostic = vi.fn();
    registry.subscribeToInvocationDiagnostics(diagnostic);
    const target = new KeyboardTarget();
    using _binding = bindActionKeyboardDispatcher(registry, target);

    target.dispatch(keyboardEvent({ ctrlKey: true }).event);
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledOnce());

    expect(diagnostic).toHaveBeenCalledWith({
      actionId: "test.open",
      error,
    });
  });

  it("removes the page listener when disposed", () => {
    const run = vi.fn();
    using registry = createRegistry(
      { open: { title: "Open", run } },
      { "test.open": "ctrl+k" },
    );
    const target = new KeyboardTarget();
    const binding = bindActionKeyboardDispatcher(registry, target);
    binding[Symbol.dispose]();

    target.dispatch(keyboardEvent({ ctrlKey: true }).event);

    expect(run).not.toHaveBeenCalled();
  });
});
