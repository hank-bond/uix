/* eslint-disable @typescript-eslint/explicit-function-return-type -- inferred state-builder returns are the contract under test. */

import { Type } from "typebox";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { ChannelContract } from "./channels";
import {
  type AgentChannelDefinition,
  type AgentFeatureStateBase,
  defineFeature,
  type WorkspaceChannelDefinition,
  type WorkspaceFeatureStateBase,
} from "./feature";
import type {
  AgentFeatureStateBuilder,
  FeatureStateOf,
  WorkspaceFeatureStateBuilder,
} from "./feature-state";
import { defineSettings } from "./settings";

const featureSettings = defineSettings({
  schema: Type.Object({
    enabled: Type.Boolean(),
  }),
});

const pingContract = {
  feature: "typed",
  requests: {
    ping: {
      requestSchema: Type.Object({ value: Type.String() }),
      responseSchema: Type.Object({ enabled: Type.Boolean() }),
    },
  },
  events: {},
} as const satisfies ChannelContract;

const buildChannelState = (
  state: WorkspaceFeatureStateBuilder<WorkspaceFeatureStateBase>,
) => state.add({ repository: new Map<string, string>() });

type ChannelState = FeatureStateOf<ReturnType<typeof buildChannelState>>;

const workspaceChannel = {
  contract: pingContract,
  handlers: (state) => ({
    ping: {
      handler: (request) => {
        expectTypeOf(request.value).toEqualTypeOf<string>();
        expectTypeOf(state.repository).toEqualTypeOf<Map<string, string>>();
        return { enabled: state.settings.get<boolean>("enabled") ?? false };
      },
    },
  }),
} satisfies WorkspaceChannelDefinition<ChannelState, typeof pingContract>;

const buildAgentChannelState = (
  state: AgentFeatureStateBuilder<AgentFeatureStateBase>,
) => state.add({ buffer: [] as string[] });

type AgentChannelState = FeatureStateOf<
  ReturnType<typeof buildAgentChannelState>
>;

const agentChannel = {
  contract: pingContract,
  handlers: (state) => ({
    ping: {
      handler: (request) => {
        expectTypeOf(request.value).toEqualTypeOf<string>();
        expectTypeOf(state.buffer).toEqualTypeOf<string[]>();
        return { enabled: state.buffer.includes(request.value) };
      },
    },
  }),
} satisfies AgentChannelDefinition<AgentChannelState, typeof pingContract>;

describe("defineFeature", () => {
  it("infers settings and completed state independently across grouped lanes", () => {
    const feature = defineFeature({
      id: "typed",
      settings: featureSettings,
      workspaceState(state) {
        expectTypeOf(state.settings.get("enabled")).toEqualTypeOf<
          boolean | undefined
        >();
        state.settings.set("enabled", true);
        // @ts-expect-error the settings definition has no other key
        state.settings.get("missing");
        return state.add({ repository: new Map<string, string>() });
      },
      agentState(state) {
        expectTypeOf(state.settings.get("enabled")).toEqualTypeOf<
          boolean | undefined
        >();
        // @ts-expect-error Agent settings are read-only
        state.settings.set("enabled", false); // eslint-disable-line @typescript-eslint/no-unsafe-call
        return state.add({ buffer: [] as string[] });
      },
      workspace: {
        resources(state) {
          expectTypeOf(state.repository).toEqualTypeOf<Map<string, string>>();
          expectTypeOf(state.documents).toHaveProperty("createStore");
          return [];
        },
        surfaces(state) {
          expectTypeOf(state.repository).toEqualTypeOf<Map<string, string>>();
          return [];
        },
      },
      agent: {
        tools(state) {
          expectTypeOf(state.buffer).toEqualTypeOf<string[]>();
          // @ts-expect-error Agent state cannot reach Workspace state additions
          void state.repository;
          // @ts-expect-error Agent state has no Workspace document authority in A1
          void state.documents;
          return [];
        },
        modelContext(state) {
          expectTypeOf(state.buffer).toEqualTypeOf<string[]>();
          return [];
        },
      },
    });

    expect(feature.id).toBe("typed");
  });

  it("supplies the matching substrate base when a state factory is absent", () => {
    defineFeature({
      id: "stateless",
      workspace: {
        resources(state) {
          expectTypeOf(state.settings).toHaveProperty("set");
          expectTypeOf(state.documents).toHaveProperty("createStore");
          return [];
        },
      },
      agent: {
        tools(state) {
          expectTypeOf(state.settings.get("anything")).toBeUnknown();
          // @ts-expect-error Agent settings remain read-only without a schema
          state.settings.set("anything", true); // eslint-disable-line @typescript-eslint/no-unsafe-call
          return [];
        },
      },
    });

    expect(true).toBe(true);
  });

  it("types static channel contracts separately from state-bound handlers", () => {
    defineFeature({
      id: "typed",
      workspaceState: buildChannelState,
      agentState: buildAgentChannelState,
      workspace: { channels: [workspaceChannel] },
      agent: { channels: [agentChannel] },
    });

    expect(true).toBe(true);
  });
});
