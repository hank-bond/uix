import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { ChannelContract } from "@uix/api/channels";

import {
  type AgentFeatureDefinition,
  assembleAgentCompositionDefinition,
} from "./composition-definition";

const contract = {
  feature: "later",
  requests: {
    inspect: {
      requestSchema: Type.Object({}),
      responseSchema: Type.Object({}),
    },
  },
  events: {},
} as const satisfies ChannelContract;

describe("assembleAgentCompositionDefinition", () => {
  it("snapshots admitted definitions in their canonical input order", () => {
    const definitions: AgentFeatureDefinition[] = [
      {
        featureId: "later",
        agent: {
          channels: [
            {
              contract,
              handlers: () => ({ inspect: { handler: () => ({}) } }),
            },
          ],
        },
      },
      { featureId: "first", agent: {} },
    ];
    const definition = assembleAgentCompositionDefinition(definitions);

    definitions.reverse();

    expect(definition.features.map(({ featureId }) => featureId)).toEqual([
      "later",
      "first",
    ]);
    expect(definition.features[0].agent.channels?.[0].contract).toBe(contract);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.features)).toBe(true);
    expect(Object.isFrozen(definition.features[0])).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent)).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent.channels)).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent.channels?.[0])).toBe(
      true,
    );
  });
});
