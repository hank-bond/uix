import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkspaceManifest } from "./manifest";

describe("parseWorkspaceManifest", () => {
  it("retains fields owned by other workspace concerns", () => {
    const manifestPath = resolve("workspace", "uix.workspace.json");
    const parsed = parseWorkspaceManifest(
      {
        name: "Demo",
        features: [{ entry: "./features/chat/index.ts" }],
        layout: { primary: "chat" },
      },
      manifestPath,
    );

    expect(parsed.manifest).toMatchObject({
      name: "Demo",
      layout: { primary: "chat" },
    });
    expect(parsed.features).toEqual([
      {
        index: 0,
        ref: "./features/chat/index.ts",
        entry: resolve(dirname(manifestPath), "features/chat/index.ts"),
      },
    ]);
  });
});
