import { describe, expect, it } from "vitest";

import { toShortcutPlatform } from "./shortcut-platform";

describe("toShortcutPlatform", () => {
  it.each([
    {
      name: "uses the user-agent client hint when available",
      browserPlatform: {
        userAgentData: { platform: "macOS" },
        platform: "Linux x86_64",
      },
      expected: "macos",
    },
    {
      name: "does not let the legacy fallback override the client hint",
      browserPlatform: {
        userAgentData: { platform: "Windows" },
        platform: "MacIntel",
      },
      expected: "other",
    },
    {
      name: "recognizes the legacy macOS platform value",
      browserPlatform: { platform: "MacIntel" },
      expected: "macos",
    },
    {
      name: "treats other legacy platform values uniformly",
      browserPlatform: { platform: "Linux x86_64" },
      expected: "other",
    },
  ] as const)("$name", ({ browserPlatform, expected }) => {
    expect(toShortcutPlatform(browserPlatform)).toBe(expected);
  });
});
