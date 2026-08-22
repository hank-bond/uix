// Workspace agent runtime behavior against a mocked Pi SDK.
import { Type } from "typebox";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import type {
  AgentEvent,
  AgentStatus,
  ModelRef,
} from "@uix/api/agent-channels";
import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import { withHandlers } from "@uix/api/channels";
import type {
  SettingsDefinition,
  SettingsHandleFrom,
  SettingsValues,
} from "@uix/api/settings";

import { agentWorkspaceSettings } from "./settings";
import {
  createWorkspaceAgentRuntime,
  type WorkspaceAgentRuntime,
} from "./workspace-agent-runtime";
import type { ActivatedAgentFeature } from "../features/loader";
import {
  registerTurnStateContributions,
  TurnStateRegistry,
} from "../turn-state";

interface FakeModel {
  provider: string;
  id: string;
  name: string;
  authed: boolean;
}

// Mutable state the mocked sdk reads at call time. Tests reconfigure it via
// the returned handles below. Hoisted because vi.mock factories run before
// module-scope initializers.
const sdk = vi.hoisted(() => {
  const state = {
    models: [] as FakeModel[],
    branch: [] as Array<Record<string, unknown>>,
    replacementBranch: undefined as Array<Record<string, unknown>> | undefined,
    // Extension `on(event, handler)` hooks installed when the session opens.
    extensionHandlers: new Map<string, (event: unknown) => void>(),
    registeredTools: [] as Array<{ name: string }>,
    extensionBindings: [] as Array<{
      sessionId: string;
      bindings: Record<string, unknown>;
    }>,
    session: undefined as Record<string, unknown> | undefined,
    runtimeCreates: 0,
    runtimeOptions: undefined as Record<string, unknown> | undefined,
    replaceRuntime: undefined as
      | ((reason?: "new" | "switch") => Promise<void>)
      | undefined,
    replacementSessionId: "replacement-session-id",
    replacementSessionFile: "/tmp/replacement-session.jsonl",
    switchCancelled: false,
    runtimeNewSession: undefined as ReturnType<typeof vi.fn> | undefined,
    runtimeSwitchSession: undefined as ReturnType<typeof vi.fn> | undefined,
    lastCreateOptions: undefined as Record<string, unknown> | undefined,
    servicesLoads: 0,
    servicesOptions: [] as Array<{ cwd: string; agentDir: string }>,
    pendingProviderModels: [] as FakeModel[],
    promptPromise: undefined as Promise<void> | undefined,
    abortTurn: undefined as (() => void | Promise<void>) | undefined,
    sessionTitle: undefined as string | undefined,
  };

  const registry = {
    refresh: vi.fn(async () => {}),
    getProviders: () =>
      [...new Set(state.models.map((model) => model.provider))].map(
        (provider) => ({
          id: provider,
          name: provider,
          auth: { apiKey: { login: vi.fn() } },
        }),
      ),
    getAvailable: () =>
      Promise.resolve(state.models.filter((model) => model.authed)),
    getProviderAuthStatus: (provider: string) => ({
      configured: state.models.some(
        (model) => model.provider === provider && model.authed,
      ),
    }),
    getModel: (provider: string, id: string) =>
      state.models.find(
        (model) => model.provider === provider && model.id === id,
      ),
    hasConfiguredAuth: (provider: string) =>
      state.models.some((model) => model.provider === provider && model.authed),
    isUsingOAuth: () => false,
    login: vi.fn(),
  };

  const manager = {
    getBranch: () => state.branch,
    getSessionId: () => "session-id",
    getSessionDir: () => "/tmp/sessions",
    getSessionFile: () => "/tmp/session.jsonl",
    getCwd: () => "/tmp/ws",
    getHeader: () => ({
      timestamp: "2026-07-19T10:00:00.000Z",
      cwd: "/tmp/ws",
    }),
    getEntries: () => state.branch,
    getSessionName: () => state.sessionTitle,
    appendMessage: () => "entry-id",
    appendSessionInfo: vi.fn((title: string) => {
      state.sessionTitle = title.trim() || undefined;
      return "session-info-id";
    }),
    appendCustomEntry: vi.fn(() => "entry-id"),
    appendCustomMessageEntry: () => "entry-id",
  };

  function makeSession(
    model: FakeModel | undefined,
    sessionManager: Record<string, unknown> = manager,
  ): {
    model: FakeModel | undefined;
    sessionManager: Record<string, unknown>;
    isStreaming: boolean;
    abort: Mock;
    unsubscribe: Mock;
    setModel: Mock;
    setSessionName: Mock;
    subscribe: Mock;
    bindExtensions: Mock;
    dispose: Mock;
    prompt: Mock;
    reload: Mock;
  } {
    const unsubscribe = vi.fn();
    return {
      model,
      sessionManager,
      isStreaming: false,
      abort: vi.fn(async () => {
        await state.abortTurn?.();
      }),
      unsubscribe,
      setModel: vi.fn((next: FakeModel) => {
        (state.session as { model?: FakeModel }).model = next;
        state.extensionHandlers.get("model_select")?.({
          type: "model_select",
          model: next,
          previousModel: model,
          source: "set",
        });
      }),
      setSessionName: vi.fn((title: string) => {
        manager.appendSessionInfo(title);
      }),
      subscribe: vi.fn(() => unsubscribe),
      bindExtensions: vi.fn((bindings: Record<string, unknown>) => {
        const getSessionId = sessionManager.getSessionId as () => string;
        state.extensionBindings.push({
          sessionId: getSessionId(),
          bindings,
        });
        state.extensionHandlers.get("session_start")?.({
          type: "session_start",
          reason: "startup",
        });
        return Promise.resolve();
      }),
      dispose: vi.fn(),
      prompt: vi.fn(async () => {
        await state.promptPromise;
      }),
      reload: vi.fn(async () => {}),
    };
  }

  return {
    state,
    registry,
    manager,
    makeSession,
    module: {
      SessionManager: {
        continueRecent: vi.fn(() => manager),
        create: vi.fn(() => manager),
        open: vi.fn(() => manager),
      },
      createAgentSessionServices: async (options: {
        cwd: string;
        agentDir: string;
        resourceLoaderOptions?: {
          extensionFactories: Array<(pi: unknown) => Promise<void>>;
        };
      }) => {
        state.servicesLoads += 1;
        state.servicesOptions.push({
          cwd: options.cwd,
          agentDir: options.agentDir,
        });
        for (const model of state.pendingProviderModels) {
          const index = state.models.findIndex(
            (current) =>
              current.provider === model.provider && current.id === model.id,
          );
          if (index === -1) state.models.push(model);
          else state.models[index] = model;
        }
        const pi = {
          on: (event: string, handler: (e: unknown) => void) => {
            state.extensionHandlers.set(event, handler);
          },
          registerTool: (tool: { name: string }) => {
            state.registeredTools.push(tool);
          },
        };
        for (const factory of options.resourceLoaderOptions
          ?.extensionFactories ?? []) {
          await factory(pi);
        }
        return {
          cwd: options.cwd,
          agentDir: options.agentDir,
          modelRuntime: registry,
          resourceLoader: { reload: async () => {} },
          diagnostics: [],
        };
      },
      createAgentSessionFromServices: (options: {
        model?: FakeModel;
        sessionManager?: Record<string, unknown>;
      }) => {
        state.lastCreateOptions = options;
        // Mirror pi's resolution shape: explicit model wins, else first
        // available, else none.
        const model = options.model ?? state.models.filter((m) => m.authed)[0];
        state.session = makeSession(model, options.sessionManager);
        return Promise.resolve({ session: state.session });
      },
      createAgentSessionRuntime: async (
        createRuntime: (options: Record<string, unknown>) => Promise<{
          session: Record<string, unknown>;
          services: Record<string, unknown>;
        }>,
        options: Record<string, unknown>,
      ) => {
        state.runtimeCreates += 1;
        state.runtimeOptions = options;
        const result = await createRuntime(options);
        let rebindSession:
          | ((session: Record<string, unknown>) => Promise<void>)
          | undefined;
        let beforeSessionInvalidate: (() => void) | undefined;
        const runtime = {
          session: result.session,
          services: result.services,
          newSession: vi.fn(async () => {
            await state.replaceRuntime?.("new");
            return { cancelled: false };
          }),
          switchSession: vi.fn(async () => {
            if (state.switchCancelled) return { cancelled: true };
            await state.replaceRuntime?.("switch");
            return { cancelled: false };
          }),
          setRebindSession: (
            callback?: (session: Record<string, unknown>) => Promise<void>,
          ) => {
            rebindSession = callback;
          },
          setBeforeSessionInvalidate: (callback?: () => void) => {
            beforeSessionInvalidate = callback;
          },
          dispose: vi.fn(() => {
            beforeSessionInvalidate?.();
            (runtime.session.dispose as () => void)();
            return Promise.resolve();
          }),
        };
        state.runtimeNewSession = runtime.newSession;
        state.runtimeSwitchSession = runtime.switchSession;
        state.replaceRuntime = async (reason = "new") => {
          beforeSessionInvalidate?.();
          const replacementManager = {
            ...manager,
            getBranch: () => state.replacementBranch ?? state.branch,
            getSessionId: () => state.replacementSessionId,
            getSessionFile: () => state.replacementSessionFile,
            getHeader: () => ({
              timestamp: "2026-07-19T11:00:00.000Z",
              cwd: "/tmp/ws",
            }),
          };
          const replacement = await createRuntime({
            ...options,
            sessionManager: replacementManager,
            sessionStartEvent: { type: "session_start", reason },
          });
          runtime.session = replacement.session;
          runtime.services = replacement.services;
          await rebindSession?.(replacement.session);
        };
        return runtime;
      },
    },
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => sdk.module);

const anthropic = {
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  name: "Claude Sonnet 4.5",
  authed: true,
};
const openai = {
  provider: "openai",
  id: "gpt-5",
  name: "GPT-5",
  authed: true,
};
const unauthed = {
  provider: "google",
  id: "gemini",
  name: "Gemini",
  authed: false,
};

function turnStateEntry(state: Record<string, unknown>): {
  id: string;
  parentId: undefined;
  timestamp: string;
  type: "custom";
  customType: string;
  data: { state: Record<string, unknown> };
} {
  return {
    id: "turn-state",
    parentId: undefined,
    timestamp: new Date(0).toISOString(),
    type: "custom",
    customType: "uix.turn-state",
    data: { state },
  };
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createFakeSettings<Definition extends SettingsDefinition>(
  _definition: Definition,
  values = new Map<string, unknown>(),
): SettingsHandleFrom<Definition> & { values: Map<string, unknown> } {
  return {
    values,
    get: (key) =>
      values.get(key) as SettingsValues<Definition>[typeof key] | undefined,
    set: (key, value) => void values.set(key, value),
    onChange: () => () => {},
  };
}

function fakeAgentSettings(initial?: ModelRef): SettingsHandleFrom<
  typeof agentWorkspaceSettings
> & {
  values: Map<string, unknown>;
} {
  return createFakeSettings(
    agentWorkspaceSettings,
    new Map(initial ? [["defaultModel", initial]] : []),
  );
}

function agentFeaturesFromTurnState(
  registry?: TurnStateRegistry,
): readonly ActivatedAgentFeature[] {
  if (!registry) return [];
  const byFeature = new Map<
    string,
    Record<
      string,
      {
        schema: ReturnType<TurnStateRegistry["list"]>[number]["schema"];
        createSnapshot: ReturnType<
          TurnStateRegistry["list"]
        >[number]["createSnapshot"];
        restore: ReturnType<TurnStateRegistry["list"]>[number]["restore"];
      }
    >
  >();
  for (const cell of registry.list()) {
    const cells = byFeature.get(cell.featureId) ?? {};
    cells[cell.cellName] = {
      schema: cell.schema,
      createSnapshot: cell.createSnapshot,
      restore: cell.restore,
    };
    byFeature.set(cell.featureId, cells);
  }
  return [...byFeature].map(([id, turnState]) => ({
    id,
    create: () => ({ turnState }),
  }));
}

function createHarness(
  settings?: SettingsHandleFrom<typeof agentWorkspaceSettings>,
  turnState?: TurnStateRegistry,
  workspace = {
    stateRoot: "/tmp/ws",
    agentCwd: "/tmp/ws",
    manifestPath: "/tmp/ws/uix.workspace.json",
  },
  agentFeatures: readonly ActivatedAgentFeature[] = agentFeaturesFromTurnState(
    turnState,
  ),
): {
  agentRuntime: WorkspaceAgentRuntime;
  events: AgentEvent[];
  scopedEvents: Array<{ sessionId: string; event: AgentEvent }>;
  statuses: AgentStatus[];
} {
  const events: AgentEvent[] = [];
  const scopedEvents: Array<{ sessionId: string; event: AgentEvent }> = [];
  const statuses: AgentStatus[] = [];
  const agentRuntime = createWorkspaceAgentRuntime({
    documents: {
      createStore: () => ({
        getCurrent: () => Promise.resolve(null),
        setCurrent: () => Promise.resolve(),
        createSnapshot: (documentId, content, meta) =>
          Promise.resolve({
            id: "version",
            documentId,
            content,
            meta,
            createdAt: new Date(0).toISOString(),
          }),
        getVersion: () => Promise.resolve(null),
      }),
    },
    getAgentFeatures: () => agentFeatures,
    onEvent: (sessionId, event) => {
      events.push(event);
      scopedEvents.push({ sessionId, event });
    },
    workspace,
    piAppDataDir: "/tmp/pi-app-data",
    ...(settings && { agentSettings: settings }),
    onFeatureEvent: () => undefined,
    onStatusChange: (_sessionId, status) => statuses.push(status),
    openExternal: () => undefined,
    onProviderAuthFlowSnapshot: () => undefined,
    onModelAvailabilityChange: () => undefined,
  });
  return { agentRuntime, events, scopedEvents, statuses };
}

beforeEach(() => {
  sdk.state.models = [anthropic, openai, unauthed];
  sdk.state.branch = [];
  sdk.state.replacementBranch = undefined;
  sdk.state.extensionHandlers.clear();
  sdk.state.registeredTools = [];
  sdk.state.extensionBindings = [];
  sdk.state.session = undefined;
  sdk.state.runtimeCreates = 0;
  sdk.state.runtimeOptions = undefined;
  sdk.state.replaceRuntime = undefined;
  sdk.state.replacementSessionId = "replacement-session-id";
  sdk.state.replacementSessionFile = "/tmp/replacement-session.jsonl";
  sdk.state.switchCancelled = false;
  sdk.state.runtimeNewSession = undefined;
  sdk.state.runtimeSwitchSession = undefined;
  sdk.state.lastCreateOptions = undefined;
  sdk.state.servicesLoads = 0;
  sdk.state.servicesOptions = [];
  sdk.state.pendingProviderModels = [];
  sdk.state.promptPromise = undefined;
  sdk.state.abortTurn = undefined;
  sdk.state.sessionTitle = undefined;
  sdk.registry.login.mockClear();
  sdk.registry.refresh.mockClear();
  sdk.module.SessionManager.continueRecent.mockClear();
  sdk.module.SessionManager.create.mockClear();
  sdk.module.SessionManager.open.mockClear();
  sdk.manager.appendSessionInfo.mockClear();
  sdk.manager.appendCustomEntry.mockClear();
});

describe("workspace agent instances", () => {
  it("shares one guarded instance and lazy runtime for one session", async () => {
    const { agentRuntime } = createHarness();
    const target = { sessionId: "session-id" as never };
    const first = await agentRuntime.acquire(target, sdk.manager as never);
    const second = await agentRuntime.acquire(target);

    expect(first.value).toBe(second.value);
    expect(sdk.state.runtimeCreates).toBe(0);
    await Promise.all([
      agentRuntime.prompt(first, "first"),
      agentRuntime.prompt(second, "second"),
    ]);
    expect(sdk.state.runtimeCreates).toBe(1);

    first[Symbol.dispose]();
    second[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("installs tools from the accepted instance registries", async () => {
    const feature: ActivatedAgentFeature = {
      id: "inspector",
      create: () => ({
        agentTools: [
          {
            name: "check",
            tool: {
              label: "check",
              description: "check",
              parameters: Type.Object({}),
              execute: () => Promise.resolve({ content: [], details: {} }),
            },
          },
        ],
      }),
    };
    const { agentRuntime } = createHarness(undefined, undefined, undefined, [
      feature,
    ]);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-a" as never },
      sdk.manager as never,
    );

    await agentRuntime.prompt(guard, "inspect");

    expect(sdk.state.registeredTools.map(({ name }) => name)).toContain(
      "inspector__check",
    );
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("creates separate feature closures for different sessions", async () => {
    const contract = {
      feature: "counter",
      requests: {
        increment: {
          requestSchema: Type.Void(),
          responseSchema: Type.Number(),
        },
      },
      events: {},
    } as const;
    let factoryCalls = 0;
    const feature: ActivatedAgentFeature = {
      id: "counter",
      create: () => {
        factoryCalls += 1;
        let count = 0;
        return {
          channels: [
            withHandlers(contract, {
              increment: { handler: () => ++count },
            }),
          ],
        };
      },
    };
    const { agentRuntime } = createHarness(undefined, undefined, undefined, [
      feature,
    ]);
    const first = await agentRuntime.acquire(
      { sessionId: "session-a" as never },
      sdk.manager as never,
    );
    const firstPeer = await agentRuntime.acquire({
      sessionId: "session-a" as never,
    });
    const second = await agentRuntime.acquire(
      { sessionId: "session-b" as never },
      sdk.manager as never,
    );
    const channel = toChannelCanonicalId("counter", "increment");

    await expect(
      first.value.featureChannels.invoke(channel, undefined),
    ).resolves.toBe(1);
    await expect(
      firstPeer.value.featureChannels.invoke(channel, undefined),
    ).resolves.toBe(2);
    await expect(
      second.value.featureChannels.invoke(channel, undefined),
    ).resolves.toBe(1);
    expect(first.value.features).toBe(firstPeer.value.features);
    expect(first.value.features).not.toBe(second.value.features);
    expect(factoryCalls).toBe(2);

    first[Symbol.dispose]();
    firstPeer[Symbol.dispose]();
    second[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("replaces idle feature callbacks and rejects reload during a turn", async () => {
    const contract = {
      feature: "generation",
      requests: {
        read: {
          requestSchema: Type.Void(),
          responseSchema: Type.Number(),
        },
      },
      events: {},
    } as const;
    let generation = 1;
    const disposed: number[] = [];
    const feature: ActivatedAgentFeature = {
      id: "generation",
      create: () => {
        const value = generation;
        return {
          channels: [
            withHandlers(contract, {
              read: { handler: () => value },
            }),
          ],
          [Symbol.asyncDispose]: () => {
            disposed.push(value);
            return Promise.resolve();
          },
        };
      },
    };
    const { agentRuntime } = createHarness(undefined, undefined, undefined, [
      feature,
    ]);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-a" as never },
      sdk.manager as never,
    );
    const channel = toChannelCanonicalId("generation", "read");
    await expect(
      guard.value.featureChannels.invoke(channel, undefined),
    ).resolves.toBe(1);

    const promptGate = deferred();
    sdk.state.promptPromise = promptGate.promise;
    const prompt = agentRuntime.prompt(guard, "hold reload");
    await vi.waitFor(() => {
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    });
    expect(() => agentRuntime.acquireReloadAdmission()).toThrow(
      "Agent operation is active",
    );
    promptGate.resolve();
    await prompt;

    generation = 2;
    {
      using _reload = agentRuntime.acquireReloadAdmission();
      await agentRuntime.prompt(guard, "blocked by reload");
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
      await agentRuntime.reloadFeatureInstances();
    }
    await expect(
      guard.value.featureChannels.invoke(channel, undefined),
    ).resolves.toBe(2);
    expect(disposed).toEqual([1]);

    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
    expect(disposed).toEqual([1, 2]);
  });

  it("keeps feature channel operations outside the reload boundary", async () => {
    const contract = {
      feature: "writer",
      requests: {
        write: {
          requestSchema: Type.Void(),
          responseSchema: Type.Void(),
        },
      },
      events: {},
    } as const;
    const operationGate = deferred();
    const handler = vi.fn(() => operationGate.promise);
    const feature: ActivatedAgentFeature = {
      id: "writer",
      create: () => ({
        channels: [
          withHandlers(contract, {
            write: { handler },
          }),
        ],
      }),
    };
    const { agentRuntime } = createHarness(undefined, undefined, undefined, [
      feature,
    ]);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-a" as never },
      sdk.manager as never,
    );
    const channel = toChannelCanonicalId("writer", "write");

    const operation = agentRuntime.invokeFeatureChannel(
      guard,
      channel,
      undefined,
    );
    expect(() => agentRuntime.acquireReloadAdmission()).toThrow(
      "Agent operation is active",
    );
    operationGate.resolve();
    await operation;

    {
      using _reload = agentRuntime.acquireReloadAdmission();
      await expect(
        agentRuntime.invokeFeatureChannel(guard, channel, undefined),
      ).rejects.toThrow("Workspace reload is active");
    }
    expect(handler).toHaveBeenCalledOnce();

    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("rejects a competing prompt before it enters Pi", async () => {
    const gate = deferred();
    sdk.state.promptPromise = gate.promise;
    const { agentRuntime, events } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const first = agentRuntime.prompt(guard, "first");
    await vi.waitFor(() => {
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    });
    await agentRuntime.prompt(guard, "second");

    expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    expect(
      events.some(
        (event) =>
          event.type === "transcript_append" &&
          event.item.kind === "error" &&
          event.item.message === "Agent is already running",
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === "agent_end")).toBe(false);
    expect(
      events.filter((event) => event.type.startsWith("active_turn_")),
    ).toEqual([{ type: "active_turn_start" }]);

    gate.resolve();
    await first;
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("cancels one active turn through Pi without disposing its instance", async () => {
    const gate = deferred();
    sdk.state.promptPromise = gate.promise;
    sdk.state.abortTurn = () => {
      gate.resolve();
    };
    const { agentRuntime, events } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const prompt = agentRuntime.prompt(guard, "long turn");
    await vi.waitFor(() => {
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    });

    await expect(agentRuntime.cancelTurn(guard)).resolves.toBe(true);
    await prompt;

    expect(sdk.state.session?.["abort"] as Mock).toHaveBeenCalledOnce();
    expect(
      events.some(
        (event) =>
          event.type === "transcript_append" && event.item.kind === "error",
      ),
    ).toBe(false);
    expect(
      events.filter((event) => event.type.startsWith("active_turn_")),
    ).toEqual([{ type: "active_turn_start" }, { type: "active_turn_end" }]);
    await expect(agentRuntime.cancelTurn(guard)).resolves.toBe(false);

    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("ends active-turn activity only after Pi abort completion", async () => {
    const promptGate = deferred();
    const abortGate = deferred();
    sdk.state.promptPromise = promptGate.promise;
    sdk.state.abortTurn = async () => {
      promptGate.resolve();
      await abortGate.promise;
    };
    const { agentRuntime, events } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const prompt = agentRuntime.prompt(guard, "long turn");
    await vi.waitFor(() => {
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    });
    let cancellationCompleted = false;
    const cancellation = agentRuntime.cancelTurn(guard).then((cancelled) => {
      cancellationCompleted = true;
      return cancelled;
    });
    await vi.waitFor(() => {
      expect(sdk.state.session?.["abort"] as Mock).toHaveBeenCalledOnce();
    });

    expect(cancellationCompleted).toBe(false);
    expect(guard.value.isTurnActive()).toBe(true);
    expect(
      events.filter((event) => event.type.startsWith("active_turn_")),
    ).toEqual([{ type: "active_turn_start" }]);

    abortGate.resolve();
    await expect(cancellation).resolves.toBe(true);
    await prompt;
    expect(guard.value.isTurnActive()).toBe(false);
    expect(
      events.filter((event) => event.type.startsWith("active_turn_")),
    ).toEqual([{ type: "active_turn_start" }, { type: "active_turn_end" }]);

    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("does not abort idle Pi while cancelling turn-state preparation", async () => {
    const snapshotGate = deferred();
    const createSnapshot = vi.fn(async () => {
      await snapshotGate.promise;
      return "live";
    });
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot,
        restore: () => undefined,
      },
    });
    const { agentRuntime, events } = createHarness(undefined, turnState);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const prompt = agentRuntime.prompt(guard, "prepared turn");
    await vi.waitFor(() => {
      expect(createSnapshot).toHaveBeenCalledOnce();
    });
    const cancellation = agentRuntime.cancelTurn(guard);
    await Promise.resolve();

    expect(sdk.state.session?.["abort"] as Mock).not.toHaveBeenCalled();
    expect(sdk.state.session?.["prompt"] as Mock).not.toHaveBeenCalled();

    snapshotGate.resolve();
    await expect(cancellation).resolves.toBe(true);
    await prompt;
    expect(sdk.state.session?.["abort"] as Mock).not.toHaveBeenCalled();
    expect(sdk.state.session?.["prompt"] as Mock).not.toHaveBeenCalled();
    expect(
      events.filter((event) => event.type.startsWith("active_turn_")),
    ).toEqual([{ type: "active_turn_start" }, { type: "active_turn_end" }]);

    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("aborts a detached turn before draining its guard on shutdown", async () => {
    const gate = deferred();
    sdk.state.promptPromise = gate.promise;
    sdk.state.abortTurn = () => {
      gate.resolve();
    };
    const { agentRuntime } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const prompt = agentRuntime.prompt(guard, "long turn");
    await vi.waitFor(() => {
      expect(sdk.state.session?.["prompt"] as Mock).toHaveBeenCalledOnce();
    });
    guard[Symbol.dispose]();

    await agentRuntime[Symbol.asyncDispose]();
    await prompt;
    expect(sdk.state.session?.["abort"] as Mock).toHaveBeenCalledOnce();
  });

  it("creates distinct sessions with independent instance state", async () => {
    const { agentRuntime } = createHarness();
    const managerB = {
      ...sdk.manager,
      getSessionId: () => "session-b",
    };
    const a = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );
    const b = await agentRuntime.acquire(
      { sessionId: "session-b" as never },
      managerB as never,
    );

    expect(a.value).not.toBe(b.value);
    expect(a.value.state).not.toBe(b.value.state);
    a.value.state.setCurrentModel({ provider: "openai", id: "gpt-5" });
    expect(b.value.state.getCurrentModel()).toBeUndefined();

    a[Symbol.dispose]();
    b[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("attributes emitted activity to its originating session", async () => {
    const { agentRuntime, scopedEvents } = createHarness();
    const managerB = {
      ...sdk.manager,
      getSessionId: () => "session-b",
    };
    const a = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );
    const b = await agentRuntime.acquire(
      { sessionId: "session-b" as never },
      managerB as never,
    );
    const control = { cancel: () => Promise.resolve() };
    const runningA = a.value.registerActiveTurn(control);
    const runningB = b.value.registerActiveTurn(control);

    await agentRuntime.prompt(a, "busy on a");
    await agentRuntime.prompt(b, "busy on b");

    expect(
      scopedEvents.map(({ sessionId, event }) => ({
        sessionId,
        type: event.type,
      })),
    ).toEqual([
      { sessionId: "session-id", type: "transcript_append" },
      { sessionId: "session-b", type: "transcript_append" },
    ]);

    runningA[Symbol.dispose]();
    runningB[Symbol.dispose]();
    a[Symbol.dispose]();
    b[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("applies workspace model defaults when a session runtime boots", async () => {
    const settings = fakeAgentSettings({ provider: "openai", id: "gpt-5" });
    const { agentRuntime } = createHarness(settings);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await agentRuntime.prompt(guard, "hello");

    expect(sdk.state.lastCreateOptions?.["model"]).toBe(openai);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("lists available models without creating an agent instance", async () => {
    const { agentRuntime } = createHarness();

    await expect(agentRuntime.listModels()).resolves.toEqual([
      expect.objectContaining({ provider: "anthropic", favorite: false }),
      expect.objectContaining({ provider: "openai", favorite: false }),
    ]);
    expect(sdk.state.runtimeCreates).toBe(0);
    expect(sdk.state.servicesLoads).toBe(1);
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("loads extension-provided models before returning the catalog", async () => {
    sdk.state.pendingProviderModels = [
      {
        provider: "extension",
        id: "new-model",
        name: "New Model",
        authed: true,
      },
    ];
    const { agentRuntime } = createHarness();

    await expect(agentRuntime.listModels()).resolves.toContainEqual(
      expect.objectContaining({
        provider: "extension",
        id: "new-model",
      }),
    );
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("shares one in-flight control-services creation", async () => {
    const { agentRuntime } = createHarness();

    await Promise.all([
      agentRuntime.listModels(),
      agentRuntime.listAuthProviders(),
      agentRuntime.listModels(),
    ]);

    expect(sdk.state.servicesLoads).toBe(1);
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("decorates, adds, and removes favorite models", async () => {
    const settings = fakeAgentSettings();
    const { agentRuntime } = createHarness(settings);

    await agentRuntime.setModelFavorite({
      provider: "openai",
      id: "gpt-5",
      favorite: true,
    });
    await expect(agentRuntime.listModels()).resolves.toContainEqual(
      expect.objectContaining({
        provider: "openai",
        id: "gpt-5",
        favorite: true,
      }),
    );
    await agentRuntime.setModelFavorite({
      provider: "openai",
      id: "gpt-5",
      favorite: false,
    });
    expect(settings.values.get("favoriteModels")).toEqual([]);
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("rejects an unknown favorite without changing settings", async () => {
    const settings = fakeAgentSettings();
    const { agentRuntime } = createHarness(settings);

    await expect(
      agentRuntime.setModelFavorite({
        provider: "missing",
        id: "unknown",
        favorite: true,
      }),
    ).rejects.toThrow("Unknown model");
    expect(settings.values.has("favoriteModels")).toBe(false);
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("reloads control services only after they have been used", async () => {
    const { agentRuntime } = createHarness();

    await expect(agentRuntime.reloadPiResources()).resolves.toBe(false);
    expect(sdk.state.servicesLoads).toBe(0);
    await agentRuntime.listModels();
    expect(sdk.state.servicesLoads).toBe(1);
    await expect(agentRuntime.reloadPiResources()).resolves.toBe(true);
    expect(sdk.state.servicesLoads).toBe(2);
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("reports workspace default and branch-owned live model state", async () => {
    const settings = fakeAgentSettings({ provider: "openai", id: "gpt-5" });
    const { agentRuntime } = createHarness(settings);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    expect(agentRuntime.getStatus(guard)).toEqual({
      cwd: "/tmp/ws",
      defaultModel: { provider: "openai", id: "gpt-5" },
    });
    await agentRuntime.prompt(guard, "hello");
    expect(agentRuntime.getStatus(guard)).toEqual({
      cwd: "/tmp/ws",
      defaultModel: { provider: "openai", id: "gpt-5" },
      model: { provider: "openai", id: "gpt-5" },
    });
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("selects an available model without changing the workspace default", async () => {
    const settings = fakeAgentSettings({
      provider: "anthropic",
      id: "claude-sonnet-4-5",
    });
    const { agentRuntime } = createHarness(settings);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await expect(
      agentRuntime.selectModel(guard, { provider: "openai", id: "gpt-5" }),
    ).resolves.toMatchObject({
      model: { provider: "openai", id: "gpt-5" },
    });
    expect(settings.values.get("defaultModel")).toEqual({
      provider: "anthropic",
      id: "claude-sonnet-4-5",
    });
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("rejects unavailable model selection", async () => {
    const { agentRuntime } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await expect(
      agentRuntime.selectModel(guard, {
        provider: "google",
        id: "gemini",
      }),
    ).rejects.toThrow("Model is not available");
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("reads history and summary without booting the Pi runtime", async () => {
    sdk.state.branch = [
      {
        id: "message-1",
        parentId: null,
        timestamp: "2026-07-19T10:00:00.000Z",
        type: "message",
        message: {
          role: "user",
          content: "hello",
          timestamp: 1,
        },
      },
    ];
    const { agentRuntime } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    const history = await agentRuntime.readSessionHistory(guard);

    expect(history.session.sessionId).toBe("session-id");
    expect(history.transcript.items).toEqual([
      expect.objectContaining({ kind: "user", text: "hello" }),
    ]);
    expect(sdk.state.runtimeCreates).toBe(0);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("sets, clears, and normalizes session titles without booting Pi", async () => {
    const { agentRuntime } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await agentRuntime.setSessionTitle(guard, "session-id", "  First\nTitle  ");
    expect(sdk.manager.appendSessionInfo).toHaveBeenLastCalledWith(
      "First Title",
    );
    await agentRuntime.setSessionTitle(guard, "session-id", null);
    expect(sdk.manager.appendSessionInfo).toHaveBeenLastCalledWith("");
    await expect(
      agentRuntime.setSessionTitle(guard, "session-id", "  \n "),
    ).rejects.toThrow("cannot be blank");
    expect(sdk.state.runtimeCreates).toBe(0);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("lets Pi restore a branch model_change instead of forcing the default", async () => {
    sdk.state.branch = [
      {
        id: "model-change",
        type: "model_change",
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
      },
    ];
    const settings = fakeAgentSettings({ provider: "openai", id: "gpt-5" });
    const { agentRuntime } = createHarness(settings);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await agentRuntime.prompt(guard, "hello");

    expect(sdk.state.lastCreateOptions?.["model"]).toBeUndefined();
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("restores branch turn state before admitting the instance guard", async () => {
    const turnState = new TurnStateRegistry();
    const restore = vi.fn();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { agentRuntime } = createHarness(undefined, turnState);

    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    expect(restore).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledWith("persisted");
    expect(sdk.state.servicesLoads).toBe(0);
    expect(sdk.state.runtimeCreates).toBe(0);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("commits guarded feature turn state after restoration", async () => {
    const turnState = new TurnStateRegistry();
    const createSnapshot = vi.fn(() => "live");
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot,
        restore: () => undefined,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { agentRuntime } = createHarness(undefined, turnState);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await expect(agentRuntime.commitFeatureTurnState()).resolves.toBe(true);
    expect(createSnapshot).toHaveBeenCalledOnce();
    expect(sdk.manager.appendCustomEntry).toHaveBeenCalledWith(
      "uix.turn-state",
      {
        cwd: "/tmp/ws",
        state: { "canvas.documents": "live" },
      },
    );
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("propagates guarded feature snapshot failures", async () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => {
          throw new Error("snapshot failed");
        },
        restore: () => undefined,
      },
    });
    const { agentRuntime } = createHarness(undefined, turnState);
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await expect(agentRuntime.commitFeatureTurnState()).rejects.toThrow(
      "snapshot failed",
    );
    expect(sdk.manager.appendCustomEntry).not.toHaveBeenCalled();
    guard[Symbol.dispose]();
    await expect(agentRuntime[Symbol.asyncDispose]()).rejects.toThrow();
  });

  it("rolls back failed creation before a later acquisition retries", async () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore: () => undefined,
      },
    });
    let branchReads = 0;
    const manager = {
      ...sdk.manager,
      getBranch: () => {
        branchReads += 1;
        if (branchReads === 1) throw new Error("branch read failed");
        return sdk.state.branch;
      },
    };
    const { agentRuntime } = createHarness(undefined, turnState);
    const target = { sessionId: "session-id" as never };

    await expect(
      agentRuntime.acquire(target, manager as never),
    ).rejects.toThrow("branch read failed");
    const guard = await agentRuntime.acquire(target, manager as never);

    expect(branchReads).toBeGreaterThanOrEqual(2);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("does not admit an instance until branch restoration settles", async () => {
    const turnState = new TurnStateRegistry();
    const restoreGate = deferred();
    const restore = vi.fn(async () => restoreGate.promise);
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { agentRuntime } = createHarness(undefined, turnState);

    const acquisition = agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );
    await vi.waitFor(() => {
      expect(restore).toHaveBeenCalledOnce();
    });
    let admitted = false;
    void acquisition.then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(sdk.state.runtimeCreates).toBe(0);

    restoreGate.resolve();
    const guard = await acquisition;
    expect(admitted).toBe(true);
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("reloads active Pi runtimes without booting unused Pi runtimes", async () => {
    const { agentRuntime } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );

    await expect(agentRuntime.reloadPiResources()).resolves.toBe(false);
    expect(sdk.state.runtimeCreates).toBe(0);
    await agentRuntime.prompt(guard, "hello");
    await expect(agentRuntime.reloadPiResources()).resolves.toBe(true);
    expect(sdk.state.session?.["reload"] as Mock).toHaveBeenCalledOnce();
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });

  it("mirrors Pi-originated model changes into status", async () => {
    const { agentRuntime, statuses } = createHarness();
    const guard = await agentRuntime.acquire(
      { sessionId: "session-id" as never },
      sdk.manager as never,
    );
    await agentRuntime.prompt(guard, "hello");

    sdk.state.extensionHandlers.get("model_select")?.({
      type: "model_select",
      model: openai,
      source: "extension",
    });

    expect(statuses.at(-1)?.model).toEqual({
      provider: "openai",
      id: "gpt-5",
    });
    guard[Symbol.dispose]();
    await agentRuntime[Symbol.asyncDispose]();
  });
});
