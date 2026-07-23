import { describe, expect, expectTypeOf, it } from "vitest";
import { Type } from "typebox";

import { defineFeature } from "./feature";
import { defineSettings } from "./settings";

const featureSettings = defineSettings({
  schema: Type.Object({
    enabled: Type.Boolean(),
  }),
});

describe("defineFeature", () => {
  it("carries the authored settings schema into feature callbacks", () => {
    const feature = defineFeature({
      id: "typed",
      settings: featureSettings,
      contribute(ctx) {
        expectTypeOf(ctx.settings.get("enabled")).toEqualTypeOf<
          boolean | undefined
        >();
        // @ts-expect-error the settings definition has no other key
        ctx.settings.get("missing");
        return {};
      },
    });

    expect(feature.id).toBe("typed");
  });
});
