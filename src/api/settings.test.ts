import { describe, expect, it } from "vitest";
import { Type } from "typebox";

import { defineSettings } from "./settings";

describe("defineSettings", () => {
  it("closes object schemas without discarding TypeBox identity", () => {
    const source = Type.Object({ enabled: Type.Boolean() });
    const definition = defineSettings({ schema: source });

    expect(Type.IsObject(definition.schema)).toBe(true);
    expect(getAdditionalProperties(definition.schema)).toBe(false);
    expect(getAdditionalProperties(source)).toBeUndefined();
  });

  it("closes record schemas without discarding TypeBox identity", () => {
    const source = Type.Record(Type.String(), Type.String());
    const definition = defineSettings({ schema: source });

    expect(Type.IsRecord(definition.schema)).toBe(true);
    expect(getAdditionalProperties(definition.schema)).toBe(false);
    expect(getAdditionalProperties(source)).toBeUndefined();
  });
});

function getAdditionalProperties(schema: object): unknown {
  return (schema as { readonly additionalProperties?: unknown })
    .additionalProperties;
}
