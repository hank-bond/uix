import { describe, expect, it } from "vitest";

import { toWorkspaceId } from "@uix/runtime/workspace";

import { normalizePublicOrigin, toWorkspaceLocation } from "./public-origin";

describe("public origin", () => {
  it("normalizes an HTTP authority and derives an absolute workspace location", () => {
    const origin = normalizePublicOrigin("https://uix.example:8443/");

    expect(origin).toBe("https://uix.example:8443");
    expect(toWorkspaceLocation(origin, toWorkspaceId("reference"))).toBe(
      "https://uix.example:8443/workspaces/reference",
    );
  });

  it.each([
    "file:///tmp/uix",
    "https://user:secret@uix.example",
    "https://uix.example/base",
    "https://uix.example/?origin=other",
    "https://uix.example/#other",
  ])("rejects a value that is not a public origin: %s", (value) => {
    expect(() => normalizePublicOrigin(value)).toThrow();
  });
});
