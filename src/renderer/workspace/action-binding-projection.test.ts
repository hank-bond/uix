import type { ActionCatalog } from "@uix/api/actions";
import { describe, expect, it } from "vitest";

import { deriveActionBindingProjection } from "./action-binding-projection";

const catalog: ActionCatalog = [
  {
    id: "chat.models",
    owner: "chat",
    title: "Models",
    path: ["Models"],
    enabled: true,
    running: false,
    conflictsWith: [],
  },
  {
    id: "canvas.refresh",
    owner: "canvas",
    title: "Refresh",
    path: ["Refresh"],
    enabled: true,
    running: false,
    conflictsWith: [],
  },
  {
    id: "chat.disabled",
    owner: "chat",
    title: "Disabled",
    path: ["Disabled"],
    enabled: false,
    running: false,
    conflictsWith: [],
  },
];

describe("deriveActionBindingProjection", () => {
  it("joins concrete, null, missing, and unresolved bindings", () => {
    const projection = deriveActionBindingProjection(
      catalog,
      {
        "chat.models": "mod+m",
        "canvas.refresh": null,
        "removed.open": "ctrl+o",
        "removed.disabled": null,
      },
      "other",
    );

    expect(projection.catalog[0]).toMatchObject({ binding: "ctrl+m" });
    expect(projection.catalog[1]).toMatchObject({ binding: null });
    expect(projection.catalog[2]).not.toHaveProperty("binding");
    expect(projection.unresolvedBindings).toEqual({
      "removed.open": "ctrl+o",
      "removed.disabled": null,
    });
  });

  it("marks every active claimant after platform resolution", () => {
    const projection = deriveActionBindingProjection(
      catalog,
      {
        "chat.models": "mod+k",
        "canvas.refresh": "ctrl+k",
        "chat.disabled": "ctrl+k",
      },
      "other",
    );

    expect(
      projection.catalog.map(({ id, conflictsWith }) => [id, conflictsWith]),
    ).toEqual([
      ["chat.models", ["canvas.refresh", "chat.disabled"]],
      ["canvas.refresh", ["chat.models", "chat.disabled"]],
      ["chat.disabled", ["chat.models", "canvas.refresh"]],
    ]);
  });

  it("keeps mod and ctrl distinct on macOS", () => {
    const projection = deriveActionBindingProjection(
      catalog,
      {
        "chat.models": "mod+k",
        "canvas.refresh": "ctrl+k",
      },
      "macos",
    );

    expect(projection.catalog[0]).toMatchObject({
      binding: "meta+k",
      conflictsWith: [],
    });
    expect(projection.catalog[1]).toMatchObject({
      binding: "ctrl+k",
      conflictsWith: [],
    });
  });
});
