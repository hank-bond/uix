import { describe, expect, it } from "vitest";

import { Value } from "typebox/value";

import {
  normalizeShortcut,
  parseShortcut,
  resolveShortcutForPlatform,
  ShortcutSchema,
} from "./shortcuts";

const validShortcuts = [
  ["ctrl+k", "ctrl+k"],
  ["shift+mod+p", "mod+shift+p"],
  ["alt+ctrl+delete", "ctrl+alt+delete"],
  ["shift+alt+ctrl+mod+f24", "mod+ctrl+alt+shift+f24"],
  ["ctrl+pageup", "ctrl+pageup"],
  ["alt+left", "alt+left"],
  ["shift+1", "shift+1"],
] as const;

const invalidShortcuts = [
  "a",
  "escape",
  "mod",
  "mod+",
  "+a",
  "ctrl+ctrl+a",
  "mod+shift",
  "ctrl+a+b",
  "ctrl+g g",
  "ctrl++a",
  "cmd+a",
  "meta+a",
  "control+a",
  "ctrl+F1",
  "ctrl+f25",
  "ctrl+/",
  "shift+!",
] as const;

describe("shortcut grammar", () => {
  it.each(validShortcuts)("accepts and normalizes %s", (input, canonical) => {
    expect(normalizeShortcut(input)).toBe(canonical);
    expect(Value.Check(ShortcutSchema, input)).toBe(true);
  });

  it.each(invalidShortcuts)("rejects %s", (input) => {
    expect(() => parseShortcut(input)).toThrow("Invalid shortcut");
    expect(Value.Check(ShortcutSchema, input)).toBe(false);
  });

  it("parses one canonical chord representation", () => {
    expect(parseShortcut("shift+ctrl+p")).toEqual({
      modifiers: ["ctrl", "shift"],
      key: "p",
    });
  });

  it("round-trips normalized shortcuts through JSON", () => {
    const canonical = normalizeShortcut("shift+mod+p");
    const decoded = JSON.parse(JSON.stringify(canonical)) as string;

    expect(normalizeShortcut(decoded)).toBe(canonical);
  });
});

describe("shortcut platform resolution", () => {
  it("resolves mod to meta on macOS and ctrl elsewhere", () => {
    expect(resolveShortcutForPlatform("mod+shift+p", "macos")).toBe(
      "meta+shift+p",
    );
    expect(resolveShortcutForPlatform("mod+shift+p", "other")).toBe(
      "ctrl+shift+p",
    );
  });

  it("deduplicates modifiers that converge after platform resolution", () => {
    expect(resolveShortcutForPlatform("mod+ctrl+k", "macos")).toBe(
      "meta+ctrl+k",
    );
    expect(resolveShortcutForPlatform("mod+ctrl+k", "other")).toBe("ctrl+k");
  });
});
