import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { ChannelContract } from "@uix/api/channels";

import {
  AdmittedAgentCompositionDefinition,
  type AgentFeatureDefinition,
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

describe("AdmittedAgentCompositionDefinition", () => {
  it("snapshots admitted definitions and protocols in canonical input order", () => {
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
    const definition =
      AdmittedAgentCompositionDefinition.admitGeneration(definitions);

    definitions.reverse();

    expect(definition).toBeInstanceOf(AdmittedAgentCompositionDefinition);
    expect(definition.features.map(({ featureId }) => featureId)).toEqual([
      "later",
      "first",
    ]);
    expect(definition.features[0].agent.channels?.[0].contract).not.toBe(
      contract,
    );
    expect(definition.features[0].agent.channels?.[0].contract).toEqual(
      contract,
    );
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.features)).toBe(true);
    expect(Object.isFrozen(definition.features[0])).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent)).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent.channels)).toBe(true);
    expect(Object.isFrozen(definition.features[0].agent.channels?.[0])).toBe(
      true,
    );
    expect(
      Object.isFrozen(
        definition.features[0].agent.channels?.[0].contract.requests.inspect
          .requestSchema,
      ),
    ).toBe(true);
  });

  it("rejects duplicate features and invalid base-tools policy", () => {
    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        { featureId: "same", agent: {} },
        { featureId: "same", agent: {} },
      ]),
    ).toThrow("Agent feature already admitted: same");

    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        { featureId: "base", isBaseToolsProvider: true, agent: {} },
      ]),
    ).toThrow("does not provide Agent tools");

    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "first",
          isBaseToolsProvider: true,
          agent: { tools: () => [] },
        },
        {
          featureId: "second",
          isBaseToolsProvider: true,
          agent: { tools: () => [] },
        },
      ]),
    ).toThrow("Several Agent features provide base tools: first, second");
  });

  it("admits Agent channel ownership, canonical ids, schemas, and log policy once", () => {
    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "owner",
          agent: {
            channels: [
              {
                contract: { ...contract, feature: "other" },
                handlers: () => ({ inspect: { handler: () => ({}) } }),
              },
            ],
          },
        },
      ]),
    ).toThrow("cannot admit channels owned by other");

    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "later",
          agent: {
            channels: [
              {
                contract: {
                  feature: "later",
                  requests: contract.requests,
                  events: { inspect: { event: Type.Object({}) } },
                },
                handlers: () => ({ inspect: { handler: () => ({}) } }),
              },
            ],
          },
        },
      ]),
    ).toThrow("Agent channel already admitted: later.inspect");

    const invalidSchema = {
      feature: "later",
      requests: {
        inspect: {
          requestSchema: null,
          responseSchema: Type.Object({}),
        },
      },
      events: {},
    } as unknown as ChannelContract;
    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "later",
          agent: {
            channels: [
              {
                contract: invalidSchema,
                handlers: () => ({ inspect: { handler: () => ({}) } }),
              },
            ],
          },
        },
      ]),
    ).toThrow("request schema is invalid");

    const invalidLog = {
      feature: "later",
      requests: {
        inspect: {
          requestSchema: Type.Object({}),
          responseSchema: Type.Object({}),
          log: { describeRequest: "visible" },
        },
      },
      events: {},
    } as unknown as ChannelContract;
    expect(() =>
      AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "later",
          agent: {
            channels: [
              {
                contract: invalidLog,
                handlers: () => ({ inspect: { handler: () => ({}) } }),
              },
            ],
          },
        },
      ]),
    ).toThrow("log callback describeRequest is not a function");
  });
});
