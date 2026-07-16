import type { KeybindingMap } from "@uix/api/actions";
import { describe, expect, it } from "vitest";

import { createKeybindingRequestHandlers } from "./requests";

function createHarness(initial: KeybindingMap) {
  let persisted = structuredClone(initial);
  const replacements: KeybindingMap[] = [];
  const published: KeybindingMap[] = [];
  const requestHandlers = createKeybindingRequestHandlers({
    getBindingsSnapshot: () => structuredClone(persisted),
    replaceBindings: (candidate) => {
      persisted = structuredClone(candidate);
      replacements.push(structuredClone(candidate));
      return structuredClone(persisted);
    },
    publishBindingsChanged: (bindings) => {
      published.push(structuredClone(bindings));
    },
  });
  return { requestHandlers, replacements, published };
}

describe("keybinding request handlers", () => {
  it("materializes missing defaults while existing shortcuts and null win", () => {
    const { requestHandlers, replacements, published } = createHarness({
      "chat.models": "shift+mod+m",
      "chat.disabled": null,
    });

    const confirmed = requestHandlers.reconcileDefaults({
      "chat.models": "ctrl+m",
      "chat.disabled": "mod+d",
      "chat.new": "shift+ctrl+n",
    });

    expect(confirmed).toEqual({
      "chat.models": "mod+shift+m",
      "chat.disabled": null,
      "chat.new": "ctrl+shift+n",
    });
    expect(replacements).toEqual([confirmed]);
    expect(published).toEqual([confirmed]);
  });

  it("does not rewrite materialized values when declarations later change", () => {
    const { requestHandlers, replacements, published } = createHarness({});

    expect(
      requestHandlers.reconcileDefaults({ "chat.models": "mod+m" }),
    ).toEqual({ "chat.models": "mod+m" });
    expect(
      requestHandlers.reconcileDefaults({
        "chat.models": "ctrl+shift+m",
      }),
    ).toEqual({ "chat.models": "mod+m" });

    expect(replacements).toEqual([{ "chat.models": "mod+m" }]);
    expect(published).toEqual([{ "chat.models": "mod+m" }]);
  });

  it("atomically replaces the complete candidate and removes omitted ids", () => {
    const { requestHandlers, replacements, published } = createHarness({
      "chat.models": "mod+m",
      "chat.removed": "ctrl+r",
    });

    const confirmed = requestHandlers.replaceBindings({
      "chat.models": "shift+mod+m",
      "chat.added": null,
    });

    expect(confirmed).toEqual({
      "chat.models": "mod+shift+m",
      "chat.added": null,
    });
    expect(replacements).toEqual([confirmed]);
    expect(published).toEqual([confirmed]);
  });

  it("ignores key order when deciding whether bindings changed", () => {
    const { requestHandlers, replacements, published } = createHarness({
      "chat.models": "mod+m",
      "chat.all": "ctrl+a",
    });

    expect(
      requestHandlers.reconcileDefaults({ "chat.all": "shift+a" }),
    ).toEqual({
      "chat.all": "ctrl+a",
      "chat.models": "mod+m",
    });
    expect(
      requestHandlers.replaceBindings({
        "chat.all": "ctrl+a",
        "chat.models": "mod+m",
      }),
    ).toEqual({
      "chat.all": "ctrl+a",
      "chat.models": "mod+m",
    });
    expect(replacements).toEqual([]);
    expect(published).toEqual([]);
  });

  it("rejects malformed shortcuts before replacing or publishing", () => {
    const { requestHandlers, replacements, published } = createHarness({
      "chat.models": "mod+m",
    });

    expect(() =>
      requestHandlers.replaceBindings({ "chat.models": "mod+mod+m" }),
    ).toThrow("Invalid shortcut");
    expect(replacements).toEqual([]);
    expect(published).toEqual([]);
  });
});
