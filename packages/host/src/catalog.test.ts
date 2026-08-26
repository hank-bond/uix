import { describe, expect, it } from "vitest";

import { parseWorkspaceCatalog, WorkspaceCatalogVersion } from "./catalog";

describe("workspace catalog", () => {
  it("parses the versioned machine projection", () => {
    expect(
      parseWorkspaceCatalog({
        version: WorkspaceCatalogVersion,
        workspaces: [
          {
            id: "docs",
            name: "Documentation",
            location: "https://uix.example/workspaces/docs",
          },
        ],
      }),
    ).toEqual({
      version: 1,
      workspaces: [
        {
          id: "docs",
          name: "Documentation",
          location: "https://uix.example/workspaces/docs",
        },
      ],
    });
  });

  it("rejects another projection version", () => {
    expect(() =>
      parseWorkspaceCatalog({ version: 2, workspaces: [] }),
    ).toThrow();
  });

  it("rejects fields outside the public projection", () => {
    expect(() =>
      parseWorkspaceCatalog({
        version: 1,
        workspaces: [
          {
            id: "private",
            name: "Private",
            location: "https://uix.example/workspaces/private",
            manifestPath: "/private/uix.workspace.json",
          },
        ],
      }),
    ).toThrow();
  });

  it.each([
    { id: "../private", location: "https://uix.example/workspaces/private" },
    { id: "private", location: "file:///private/uix.workspace.json" },
  ])("rejects a non-canonical entry: $id $location", (entry) => {
    expect(() =>
      parseWorkspaceCatalog({
        version: 1,
        workspaces: [{ ...entry, name: "Private" }],
      }),
    ).toThrow();
  });
});
