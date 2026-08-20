/* eslint-disable @typescript-eslint/explicit-function-return-type -- inferred builder-chain returns are the contract under test. */

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AgentFeatureStateBuilder,
  FeatureStateOf,
  WorkspaceFeatureStateBuilder,
} from "./feature-state";

interface WorkspaceBase {
  readonly settings: { readonly enabled: boolean };
  readonly log: { readonly info: (message: string) => void };
}

interface AgentBase {
  readonly settings: { readonly enabled: boolean };
  readonly publish: (event: string) => void;
}

// Return types stay inferred because inference across the chain is the contract under test.
const _buildWorkspaceState = (
  state: WorkspaceFeatureStateBuilder<WorkspaceBase>,
) =>
  state
    .add({ cache: new Map<string, string>() })
    .add({ counter: { value: 0 } });

type CompletedWorkspaceState = FeatureStateOf<
  ReturnType<typeof _buildWorkspaceState>
>;

const _buildAgentState = (state: AgentFeatureStateBuilder<AgentBase>) =>
  state.add({ buffer: [] as string[] });

type CompletedAgentState = FeatureStateOf<ReturnType<typeof _buildAgentState>>;

describe("feature-state author contracts", () => {
  it("infers accumulated readonly state across a builder chain", () => {
    expectTypeOf<CompletedWorkspaceState>().toEqualTypeOf<
      Readonly<
        WorkspaceBase & {
          readonly cache: Map<string, string>;
          readonly counter: { value: number };
        }
      >
    >();
    expectTypeOf<CompletedAgentState>().toEqualTypeOf<
      Readonly<AgentBase & { readonly buffer: string[] }>
    >();
    expect(true).toBe(true);
  });

  it("removes construction authority from completed state", () => {
    const proveCompletedShape = (state: CompletedWorkspaceState): void => {
      expectTypeOf(state.cache).toEqualTypeOf<Map<string, string>>();
      // @ts-expect-error completed feature state has no add() authority
      state.add({ late: true }); // eslint-disable-line @typescript-eslint/no-unsafe-call
      // @ts-expect-error completed feature-state members are readonly
      state.counter = { value: 1 };
    };

    void proveCompletedShape;
    expect(true).toBe(true);
  });

  it("accepts only one new string member per addition", () => {
    const proveBuilderChecks = (
      state: WorkspaceFeatureStateBuilder<WorkspaceBase>,
    ): void => {
      state.add({ cache: new Map<string, string>() });
      // @ts-expect-error additions must contain exactly one member
      state.add({ first: 1, second: 2 });
      // @ts-expect-error additions cannot replace a substrate member
      state.add({ settings: { enabled: false } });

      const widened = state.add({ cache: new Map<string, string>() });
      // @ts-expect-error additions cannot replace an earlier addition
      widened.add({ cache: new Map<string, string>() });
    };

    void proveBuilderChecks;
    expect(true).toBe(true);
  });
});
