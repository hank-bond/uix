import { describe, expect, it } from "vitest";

import { Value } from "typebox/value";

import { ActionIdSchema, KeybindingMapSchema } from "./actions";

const validActionIds = [
  "chat.models",
  "chat.models.favorites",
  "my-feature.model_picker.open-dialog",
  "feature_2.group_3.action_4",
] as const;

const invalidActionIds = [
  "chat",
  "Chat.models",
  ".chat.models",
  "chat..models",
  "chat.models.",
  "chat.favorite models",
] as const;

describe("ActionIdSchema", () => {
  it.each(validActionIds)("accepts %s", (id) => {
    expect(Value.Check(ActionIdSchema, id)).toBe(true);
  });

  it.each(invalidActionIds)("rejects %s", (id) => {
    expect(Value.Check(ActionIdSchema, id)).toBe(false);
  });
});

describe("KeybindingMapSchema", () => {
  it("accepts shortcuts and explicit unbinding", () => {
    expect(
      Value.Check(KeybindingMapSchema, {
        "chat.models.favorites": "mod+shift+m",
        "chat.models.all": null,
      }),
    ).toBe(true);
  });

  it("rejects malformed ids and shortcuts", () => {
    expect(Value.Check(KeybindingMapSchema, { "Chat.models": "mod+m" })).toBe(
      false,
    );
    expect(Value.Check(KeybindingMapSchema, { "chat.models": "shift m" })).toBe(
      false,
    );
  });
});
