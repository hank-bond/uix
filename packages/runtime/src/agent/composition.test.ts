import type {
  AgentSessionRuntime,
  ExtensionAPI,
  SessionManager,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import type { AgentToolDefinition } from "@uix/api/agent-tools";
import type { ChannelContract } from "@uix/api/channels";

import {
  AdmittedAgentCompositionDefinition,
  type AgentFeatureDefinition,
} from "./composition-definition";
import {
  type AgentInstanceOwnership,
  createComposedAgentInstance,
} from "./instance";
import type { FeatureOperationOutcome } from "../feature-operation-outcome";
import { toSessionId } from "../workspace";

const emptyParams = Type.Object({});

function toolBody(label: string): AgentToolDefinition {
  return {
    label,
    description: label,
    parameters: emptyParams,
    execute: () => Promise.resolve({ content: [], details: {} }),
  };
}

interface FakePi {
  readonly api: ExtensionAPI;
  readonly tools: ToolDefinition[];
  readonly hooks: Array<{ readonly event: string; readonly handler: unknown }>;
}

function createFakePi(onRegisterTool?: (tool: ToolDefinition) => void): FakePi {
  const tools: ToolDefinition[] = [];
  const hooks: Array<{ readonly event: string; readonly handler: unknown }> =
    [];
  return {
    tools,
    hooks,
    api: {
      registerTool(tool: ToolDefinition) {
        onRegisterTool?.(tool);
        tools.push(tool);
      },
      on(event: string, handler: unknown) {
        hooks.push({ event, handler });
      },
    } as unknown as ExtensionAPI,
  };
}

function fakeRuntime(
  dispose = vi.fn(() => Promise.resolve()),
): AgentSessionRuntime {
  return {
    session: { reload: () => Promise.resolve() },
    dispose,
  } as unknown as AgentSessionRuntime;
}

function outcome(
  outcomes: readonly FeatureOperationOutcome[],
  featureId: string,
  phase: FeatureOperationOutcome["phase"],
  facet?: string,
): FeatureOperationOutcome | undefined {
  return outcomes.find(
    (candidate) =>
      candidate.featureId === featureId &&
      candidate.phase === phase &&
      candidate.facet === facet,
  );
}

const viewpointContract = {
  feature: "everything",
  requests: {
    identify: {
      requestSchema: Type.Object({}),
      responseSchema: Type.Object({ viewpoint: Type.String() }),
    },
  },
  events: {
    changed: { event: Type.String() },
  },
} as const satisfies ChannelContract;

describe("Agent composition engine", () => {
  it("gives two real AgentInstance owners disjoint states, registries, handlers, Pi installation, and lifetimes", async () => {
    const disposed: string[] = [];
    const everything: AgentFeatureDefinition = {
      featureId: "everything",
      entryDir: "/features/everything",
      stateFactory: (builder) =>
        builder.add({ mutable: { values: [] as string[] } }).add({
          owned: {
            [Symbol.dispose]() {
              disposed.push("feature-state");
            },
          },
        }),
      agent: {
        tools: (state) => {
          const { viewpoint } = state as { readonly viewpoint: string };
          return [{ name: "inspect", tool: toolBody(`inspect ${viewpoint}`) }];
        },
        systemPrompt: (state) =>
          `Viewpoint ${(state as { readonly viewpoint: string }).viewpoint}`,
        skills: () => ["skills"],
        turnState: (state) => ({
          viewpoint: {
            schema: Type.String(),
            createSnapshot: () =>
              (state as { readonly viewpoint: string }).viewpoint,
            restore: () => undefined,
          },
        }),
        modelContext: (state) => [
          {
            name: "viewpoint",
            description: "current viewpoint",
            buffer: { kind: "update", schema: Type.String() },
            initialValue: (state as { readonly viewpoint: string }).viewpoint,
          },
        ],
        channels: [
          {
            contract: viewpointContract,
            handlers: (state) => ({
              identify: {
                handler: () => ({
                  viewpoint: (state as { readonly viewpoint: string })
                    .viewpoint,
                }),
              },
            }),
          },
        ],
      },
    };
    const definition = AdmittedAgentCompositionDefinition.admitGeneration([
      everything,
    ]);
    const pis = new Map<string, FakePi>();

    const create = async (viewpoint: string): Promise<AgentInstanceOwnership> =>
      createComposedAgentInstance({
        composition: definition,
        createFeatureStateBase: () => ({ viewpoint }),
        target: { sessionId: toSessionId(viewpoint) },
        manager: {} as SessionManager,
        state: { emit: () => undefined, cwd: "/workspace" },
        async createRuntime(_manager, _state, features) {
          expect(Symbol.asyncDispose in features).toBe(false);
          const pi = createFakePi();
          pis.set(viewpoint, pi);
          await features.install(pi.api);
          return fakeRuntime();
        },
      });

    const first = await create("first");
    const second = await create("second");
    const firstFeatures = first.featureComposition;
    const secondFeatures = second.featureComposition;
    expect(firstFeatures).toBeDefined();
    expect(secondFeatures).toBeDefined();
    if (!firstFeatures || !secondFeatures) return;

    expect(firstFeatures.definition).toBe(definition);
    expect(secondFeatures.definition).toBe(definition);
    expect(firstFeatures.featureStates).not.toBe(secondFeatures.featureStates);
    expect(firstFeatures.registries.tools).not.toBe(
      secondFeatures.registries.tools,
    );
    expect("register" in firstFeatures.registries.tools).toBe(false);
    expect("register" in firstFeatures.featureStates).toBe(false);

    const firstState = firstFeatures.featureStates.get("everything") as {
      readonly viewpoint: string;
      readonly mutable: { readonly values: string[] };
    };
    const secondState = secondFeatures.featureStates.get("everything") as {
      readonly viewpoint: string;
      readonly mutable: { readonly values: string[] };
    };
    expect(firstState).not.toBe(secondState);
    expect(firstState.mutable).not.toBe(secondState.mutable);
    firstState.mutable.values.push("only-first");
    expect(secondState.mutable.values).toEqual([]);

    const firstContext = firstFeatures.registries.modelContext.list()[0];
    const secondContext = secondFeatures.registries.modelContext.list()[0];
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext).toMatchObject({ kind: "update", value: "first" });
    expect(secondContext).toMatchObject({ kind: "update", value: "second" });

    const firstChannels = firstFeatures.registries.channels.list()[0];
    const secondChannels = secondFeatures.registries.channels.list()[0];
    expect(firstChannels.contract).toEqual(viewpointContract);
    expect(secondChannels.contract).toEqual(viewpointContract);
    expect(await firstChannels.handlers.identify.handler({})).toEqual({
      viewpoint: "first",
    });
    expect(await secondChannels.handlers.identify.handler({})).toEqual({
      viewpoint: "second",
    });
    await Promise.all([first.bootRuntime(), second.bootRuntime()]);
    expect(pis.get("first")?.tools.map((tool) => tool.name)).toEqual([
      "everything__inspect",
    ]);
    expect(pis.get("second")?.tools.map((tool) => tool.name)).toEqual([
      "everything__inspect",
    ]);
    expect(pis.get("first")?.tools[0]?.label).toBe("inspect first");
    expect(pis.get("second")?.tools[0]?.label).toBe("inspect second");
    expect(pis.get("first")?.hooks.map(({ event }) => event)).toEqual([
      "agent_end",
      "resources_discover",
      "before_agent_start",
    ]);

    await first[Symbol.asyncDispose]();
    expect(firstFeatures.featureStates.list()).toEqual([]);
    expect(firstFeatures.registries.tools.list()).toEqual([]);
    expect(firstFeatures.registries.systemPrompt.list()).toEqual([]);
    expect(firstFeatures.registries.skills.list()).toEqual([]);
    expect(firstFeatures.registries.turnState.list()).toEqual([]);
    expect(firstFeatures.registries.modelContext.list()).toEqual([]);
    expect(firstFeatures.registries.channels.list()).toEqual([]);
    expect(secondFeatures.featureStates.list()).toHaveLength(1);

    await second[Symbol.asyncDispose]();
    expect(disposed).toEqual(["feature-state", "feature-state"]);
  });

  it("isolates state failure to one viewpoint and keeps sibling facets live", async () => {
    const stateFailure = new Error("first viewpoint failed");
    const fragile: AgentFeatureDefinition = {
      featureId: "fragile",
      stateFactory: (builder) => {
        if (
          (builder as unknown as { readonly viewpoint: string }).viewpoint ===
          "first"
        ) {
          throw stateFailure;
        }
        return builder.add({ ready: true });
      },
      agent: {
        tools: () => [{ name: "inspect", tool: toolBody("inspect") }],
        systemPrompt: () => "Still independent",
      },
    };
    const steady: AgentFeatureDefinition = {
      featureId: "steady",
      agent: {
        tools: () => [{ name: "inspect", tool: toolBody("steady") }],
      },
    };
    const definition = AdmittedAgentCompositionDefinition.admitGeneration([
      fragile,
      steady,
    ]);
    const create = (viewpoint: string): Promise<AgentInstanceOwnership> =>
      createComposedAgentInstance({
        composition: definition,
        createFeatureStateBase: () => ({ viewpoint }),
        target: { sessionId: toSessionId(viewpoint) },
        manager: {} as SessionManager,
        state: { emit: () => undefined, cwd: "/workspace" },
        createRuntime: () => Promise.resolve(fakeRuntime()),
      });

    const first = await create("first");
    const second = await create("second");
    const firstFeatures = first.featureComposition;
    const secondFeatures = second.featureComposition;
    expect(firstFeatures).toBeDefined();
    expect(secondFeatures).toBeDefined();
    if (!firstFeatures || !secondFeatures) return;

    expect(firstFeatures.featureStates.get("fragile")).toBeUndefined();
    expect(secondFeatures.featureStates.get("fragile")).toMatchObject({
      ready: true,
    });
    expect(
      firstFeatures.registries.tools
        .list()
        .map(({ canonicalId }) => canonicalId),
    ).toEqual(["steady__inspect"]);
    expect(
      secondFeatures.registries.tools
        .list()
        .map(({ canonicalId }) => canonicalId),
    ).toEqual(["fragile__inspect", "steady__inspect"]);

    const stateOutcome = outcome(
      firstFeatures.listOutcomes(),
      "fragile",
      "state",
    );
    expect(stateOutcome).toMatchObject({
      status: "failed",
      error: stateFailure,
    });
    expect(
      outcome(firstFeatures.listOutcomes(), "fragile", "contribution", "tools"),
    ).toMatchObject({ status: "blocked", error: stateFailure });
    expect(
      outcome(firstFeatures.listOutcomes(), "steady", "registration", "tools"),
    ).toMatchObject({ status: "succeeded" });

    await Promise.all([
      first[Symbol.asyncDispose](),
      second[Symbol.asyncDispose](),
    ]);
  });

  it("resolves one base-tools provider while contribution and registry failures leave sibling facets live", async () => {
    const contributionFailure = new Error("skills construction failed");
    const base: AgentFeatureDefinition = {
      featureId: "base",
      isBaseToolsProvider: true,
      agent: {
        tools: () => [
          { name: "read", tool: toolBody("read") },
          { name: "other__read", tool: toolBody("reserved collision") },
        ],
      },
    };
    const other: AgentFeatureDefinition = {
      featureId: "other",
      agent: {
        tools: () => [
          { name: "safe", tool: toolBody("must roll back") },
          { name: "read", tool: toolBody("other read") },
        ],
        systemPrompt: () => "Other prompt survives",
        skills: () => {
          throw contributionFailure;
        },
      },
    };
    const extra: AgentFeatureDefinition = {
      featureId: "extra",
      agent: {
        tools: () => [{ name: "lookup", tool: toolBody("lookup") }],
      },
    };
    const definition = AdmittedAgentCompositionDefinition.admitGeneration([
      base,
      other,
      extra,
    ]);
    const instance = await createComposedAgentInstance({
      composition: definition,
      createFeatureStateBase: () => ({}),
      target: { sessionId: toSessionId("tools") },
      manager: {} as SessionManager,
      state: { emit: () => undefined, cwd: "/workspace" },
      createRuntime: () => Promise.resolve(fakeRuntime()),
    });
    const features = instance.featureComposition;
    expect(features).toBeDefined();
    if (!features) return;

    expect(
      features.registries.tools.list().map(({ canonicalId }) => canonicalId),
    ).toEqual(["read", "other__read", "extra__lookup"]);
    expect(
      outcome(features.listOutcomes(), "other", "registration", "tools"),
    ).toMatchObject({ status: "failed" });
    expect(
      outcome(features.listOutcomes(), "other", "registration", "systemPrompt"),
    ).toMatchObject({ status: "succeeded" });
    expect(
      outcome(features.listOutcomes(), "other", "contribution", "skills"),
    ).toMatchObject({ status: "failed", error: contributionFailure });
    expect(
      outcome(features.listOutcomes(), "other", "registration", "skills"),
    ).toMatchObject({ status: "blocked", error: contributionFailure });
    expect(features.registries.systemPrompt.list()).toHaveLength(1);

    await instance[Symbol.asyncDispose]();
  });

  it("installs complete registries through one hook per aggregate Pi facet", async () => {
    const turnState: NonNullable<
      AgentFeatureDefinition["agent"]["turnState"]
    > = () => ({
      value: {
        schema: Type.String(),
        createSnapshot: () => "value",
        restore: () => undefined,
      },
    });
    const first: AgentFeatureDefinition = {
      featureId: "first",
      entryDir: "/first",
      agent: {
        turnState,
        skills: () => ["skill.md"],
        systemPrompt: () => "First prompt",
      },
    };
    const second: AgentFeatureDefinition = {
      featureId: "second",
      entryDir: "/second",
      agent: {
        turnState,
        skills: () => ["skill.md"],
        systemPrompt: () => "Second prompt",
        modelContext: () => [
          {
            name: "status",
            description: "status",
            materialize: () => ({ content: "ready" }),
          },
        ],
      },
    };
    const pi = createFakePi();
    const instance = await createComposedAgentInstance({
      composition: AdmittedAgentCompositionDefinition.admitGeneration([
        first,
        second,
      ]),
      createFeatureStateBase: () => ({}),
      target: { sessionId: toSessionId("installation") },
      manager: {} as SessionManager,
      state: { emit: () => undefined, cwd: "/workspace" },
      async createRuntime(_manager, _state, installableFeatures) {
        await installableFeatures.install(pi.api);
        return fakeRuntime();
      },
    });

    await instance.bootRuntime();
    expect(pi.hooks.map(({ event }) => event)).toEqual([
      "agent_end",
      "resources_discover",
      "before_agent_start",
    ]);

    await instance[Symbol.asyncDispose]();
  });

  it("surfaces Pi installation failures through runtime boot", async () => {
    const installFailure = new Error("Pi rejected tool installation");
    const pi = createFakePi(() => {
      throw installFailure;
    });
    const instance = await createComposedAgentInstance({
      composition: AdmittedAgentCompositionDefinition.admitGeneration([
        {
          featureId: "broken",
          agent: {
            tools: () => [{ name: "broken", tool: toolBody("broken") }],
          },
        },
      ]),
      createFeatureStateBase: () => ({}),
      target: { sessionId: toSessionId("failed-installation") },
      manager: {} as SessionManager,
      state: { emit: () => undefined, cwd: "/workspace" },
      async createRuntime(_manager, _state, installableFeatures) {
        await installableFeatures.install(pi.api);
        return fakeRuntime();
      },
    });

    await expect(instance.bootRuntime()).rejects.toBe(installFailure);
    await instance[Symbol.asyncDispose]();
  });
});
