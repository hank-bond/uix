import { describe, expect, it, vi } from "vitest";

import { createModelActions } from "./model-actions";

describe("createModelActions", () => {
  it("opens each model-picker scope from its keyed action leaf", () => {
    const openModelPicker = vi.fn();
    const contribution = createModelActions(openModelPicker);
    const models = contribution.models;
    if (!("children" in models)) throw new Error("models must be a group");
    const favorites = models.children.favorites;
    const all = models.children.all;
    if ("children" in favorites || "children" in all) {
      throw new Error("model picker actions must be leaves");
    }

    expect(favorites.defaultBinding).toBeUndefined();
    expect(all.defaultBinding).toBe("mod+j");

    void favorites.run();
    void all.run();

    expect(openModelPicker.mock.calls).toEqual([["favorites"], ["all"]]);
  });
});
