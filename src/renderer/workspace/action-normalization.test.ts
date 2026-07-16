import { describe, expect, it } from "vitest";

import type { ActionContribution } from "@uix/api/actions";

import {
  normalizeActionContribution,
  toActionId,
} from "./action-normalization";

const run = (): void => undefined;

function chatActions(groupTitle = "Models"): ActionContribution {
  return {
    models: {
      title: groupTitle,
      children: {
        favorites: {
          title: "Favorite Models",
          description: "Choose from favorite models",
          defaultBinding: "shift+mod+m",
          run,
        },
      },
    },
    all_models: {
      title: "All Models",
      enabled: false,
      run,
    },
  };
}

describe("toActionId", () => {
  it("derives canonical identity from the feature and keyed path", () => {
    expect(toActionId("chat", ["models", "favorites"])).toBe(
      "chat.models.favorites",
    );
  });

  it("rejects invalid owners, names, and empty paths", () => {
    expect(() => toActionId("Chat", ["models"])).toThrow(
      "Invalid feature id: Chat",
    );
    expect(() => toActionId("chat", ["favorite.models"])).toThrow(
      "Invalid action name: favorite.models",
    );
    expect(() => toActionId("chat", [])).toThrow(
      "requires at least one local name",
    );
  });
});

describe("normalizeActionContribution", () => {
  it("flattens contributions in authored order with derived ids and title paths", () => {
    const normalized = normalizeActionContribution("chat", chatActions());

    expect(normalized.catalogEntries).toEqual([
      {
        id: "chat.models.favorites",
        owner: "chat",
        title: "Favorite Models",
        path: ["Models", "Favorite Models"],
        description: "Choose from favorite models",
        enabled: true,
        running: false,
        conflictsWith: [],
      },
      {
        id: "chat.all_models",
        owner: "chat",
        title: "All Models",
        path: ["All Models"],
        enabled: false,
        running: false,
        conflictsWith: [],
      },
    ]);
    expect(
      normalized.registrations.map(({ catalogEntry }) => catalogEntry),
    ).toEqual(normalized.catalogEntries);
    expect(normalized.registrations[0]).toMatchObject({
      id: "chat.models.favorites",
      run,
    });
    expect(normalized.registrations[0]).not.toHaveProperty("defaultBinding");
    expect(normalized.defaultBindings).toEqual({
      "chat.models.favorites": "mod+shift+m",
    });
  });

  it("keeps identity stable when display titles change", () => {
    const models = normalizeActionContribution("chat", chatActions("Models"));
    const settings = normalizeActionContribution(
      "chat",
      chatActions("Model Settings"),
    );

    expect(models.catalogEntries[0]?.id).toBe(settings.catalogEntries[0]?.id);
    expect(models.catalogEntries[0]?.path).toEqual([
      "Models",
      "Favorite Models",
    ]);
    expect(settings.catalogEntries[0]?.path).toEqual([
      "Model Settings",
      "Favorite Models",
    ]);
  });

  it("derives different identities when keyed placement changes", () => {
    const nested = normalizeActionContribution("chat", chatActions());
    const root = normalizeActionContribution("chat", {
      favorites: { title: "Favorite Models", run },
    });

    expect(nested.catalogEntries[0]?.id).toBe("chat.models.favorites");
    expect(root.catalogEntries[0]?.id).toBe("chat.favorites");
  });

  it("projects JSON-safe catalog entries without callbacks or group nodes", () => {
    const normalized = normalizeActionContribution("chat", chatActions());
    const projected = JSON.parse(
      JSON.stringify(normalized.catalogEntries),
    ) as unknown;

    expect(projected).toEqual(normalized.catalogEntries);
    expect(normalized.catalogEntries[0]).not.toHaveProperty("run");
    expect(normalized.catalogEntries[0]).not.toHaveProperty("children");
  });

  it("rejects invalid default bindings", () => {
    expect(() =>
      normalizeActionContribution("chat", {
        models: {
          title: "Models",
          defaultBinding: "mod+mod+m",
          run,
        },
      }),
    ).toThrow("Invalid shortcut");
  });

  it("rejects invalid contribution keys and empty titles", () => {
    expect(() =>
      normalizeActionContribution("chat", {
        "favorite.models": { title: "Favorite Models", run },
      }),
    ).toThrow("Invalid action name: favorite.models");
    expect(() =>
      normalizeActionContribution("chat", {
        models: { title: " ", run },
      }),
    ).toThrow("titles must not be empty");
  });
});
