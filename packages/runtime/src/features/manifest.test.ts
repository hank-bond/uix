import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkspaceManifest } from "./manifest";

describe("parseWorkspaceManifest", () => {
  it("retains fields owned by other workspace concerns", () => {
    const manifestPath = resolve("workspace", "uix.workspace.json");
    const parsed = parseWorkspaceManifest(
      {
        name: "Demo",
        features: [{ entry: "./features/chat/index.ts", baseTools: true }],
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
        baseTools: true,
      },
    ]);
  });

  it("rejects several base-tools providers before feature source loads", () => {
    const manifestPath = resolve("workspace", "uix.workspace.json");

    expect(() =>
      parseWorkspaceManifest(
        {
          name: "Demo",
          features: [
            { entry: "./features/first.ts", baseTools: true },
            { entry: "./features/second.ts", baseTools: true },
          ],
        },
        manifestPath,
      ),
    ).toThrow(
      "workspace manifest may mark only one base-tools provider; marked entries: ./features/first.ts, ./features/second.ts",
    );
  });

  it("accepts only the literal true base-tools marker", () => {
    const manifestPath = resolve("workspace", "uix.workspace.json");

    expect(() =>
      parseWorkspaceManifest(
        {
          name: "Demo",
          features: [{ entry: "./features/tools.ts", baseTools: false }],
        },
        manifestPath,
      ),
    ).toThrow("workspace manifest does not match schema");
  });
});
